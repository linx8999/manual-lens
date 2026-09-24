$ErrorActionPreference = 'Stop'

$version = '44.4.1'
$filename = "electron-v$version-win32-x64.zip"
$url = "https://gh-proxy.com/https://github.com/electron/electron/releases/download/v$version/$filename"
$expectedSha256 = '34bc07977d6c43b6514b956a5f2e3292255daa3838a49e6110f3fe19ffafb83f'
$cacheDir = Join-Path $env:LOCALAPPDATA 'electron\Cache'
$finalPath = Join-Path $cacheDir $filename
$partsDir = Join-Path $cacheDir "$filename.parts"
$concurrency = 12

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

if ((Test-Path -LiteralPath $finalPath) -and ((Get-Sha256 $finalPath) -eq $expectedSha256)) {
  Write-Output "Electron $version is already cached."
} else {
  New-Item -ItemType Directory -Force -Path $partsDir | Out-Null

  $headers = & curl.exe -sL -r 0-0 -D - -o NUL $url
  $contentRange = $headers | Where-Object { $_ -match '^Content-Range:' } | Select-Object -First 1
  if (-not $contentRange) {
    throw 'Unable to determine Electron archive size.'
  }
  $totalSize = [long](($contentRange -split '/')[-1].Trim())
  $chunkSize = [math]::Ceiling($totalSize / $concurrency)

  Write-Output "Downloading $filename with $concurrency connections ($([math]::Round($totalSize / 1MB, 1)) MiB)."

  $chunks = @()
  for ($index = 0; $index -lt $concurrency; $index++) {
    $start = [long]($index * $chunkSize)
    $end = [math]::Min($totalSize - 1, $start + $chunkSize - 1)
    if ($start -gt $end) {
      continue
    }
    $partPath = Join-Path $partsDir ('{0:D2}.part' -f $index)
    $chunks += [pscustomobject]@{
      Index = $index
      Start = $start
      End = $end
      Expected = $end - $start + 1
      Path = $partPath
    }
  }

  while ($true) {
    $attempts = @()
    foreach ($chunk in $chunks) {
      $existing = 0
      if (Test-Path -LiteralPath $chunk.Path) {
        $existing = (Get-Item -LiteralPath $chunk.Path).Length
      }
      if ($existing -ge $chunk.Expected) {
        continue
      }
      $rangeStart = $chunk.Start + $existing
      $rangeEnd = $chunk.End
      $nextPath = "$($chunk.Path).next"
      Remove-Item -LiteralPath $nextPath -Force -ErrorAction SilentlyContinue
      $arguments = @(
        '-L',
        '--silent',
        '--show-error',
        '--max-time', '180',
        '-r', "$rangeStart-$rangeEnd",
        '-o', $nextPath,
        $url
      )
      $process = Start-Process -FilePath 'curl.exe' -ArgumentList $arguments -PassThru -WindowStyle Hidden
      $attempts += [pscustomobject]@{
        Chunk = $chunk
        NextPath = $nextPath
        Process = $process
      }
    }

    if ($attempts.Count -eq 0) {
      break
    }

    while ($true) {
      $sizes = @()
      foreach ($chunk in $chunks) {
        $size = 0
        if (Test-Path -LiteralPath $chunk.Path) {
          $size += (Get-Item -LiteralPath $chunk.Path).Length
        }
        $nextPath = "$($chunk.Path).next"
        if (Test-Path -LiteralPath $nextPath) {
          $size += (Get-Item -LiteralPath $nextPath).Length
        }
        $sizes += $size
      }
      $downloaded = ($sizes | Measure-Object -Sum).Sum
      $percent = [math]::Round(($downloaded / $totalSize) * 100, 1)
      Write-Output "Progress $percent% ($([math]::Round($downloaded / 1MB, 1)) MiB)"

      if (($attempts | Where-Object { -not $_.Process.HasExited }).Count -eq 0) {
        break
      }
      Start-Sleep -Seconds 3
    }

    foreach ($attempt in $attempts) {
      if (-not (Test-Path -LiteralPath $attempt.NextPath)) {
        continue
      }
      $target = [System.IO.File]::Open(
        $attempt.Chunk.Path,
        [System.IO.FileMode]::Append,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
      )
      $received = [System.IO.File]::OpenRead($attempt.NextPath)
      try {
        $received.CopyTo($target)
      } finally {
        $received.Dispose()
        $target.Dispose()
      }
      Remove-Item -LiteralPath $attempt.NextPath -Force
    }
  }

  foreach ($chunk in $chunks) {
    $actualSize = (Get-Item -LiteralPath $chunk.Path).Length
    if ($actualSize -ne $chunk.Expected) {
      throw "Electron part $($chunk.Index + 1) is incomplete: $actualSize / $($chunk.Expected)."
    }
  }

  $temporaryArchive = Join-Path $cacheDir "$filename.download"
  $output = [System.IO.File]::Open(
    $temporaryArchive,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  try {
    foreach ($chunk in $chunks | Sort-Object Index) {
      $input = [System.IO.File]::OpenRead($chunk.Path)
      try {
        $input.CopyTo($output)
      } finally {
        $input.Dispose()
      }
    }
  } finally {
    $output.Dispose()
  }

  $actualSha256 = Get-Sha256 $temporaryArchive
  if ($actualSha256 -ne $expectedSha256) {
    throw "Electron checksum mismatch: $actualSha256"
  }
  Move-Item -LiteralPath $temporaryArchive -Destination $finalPath -Force
  Remove-Item -LiteralPath $partsDir -Recurse -Force
  Write-Output "Downloaded and verified $filename."
}

$env:ELECTRON_CACHE = $cacheDir
$env:electron_config_cache = $cacheDir
& node (Join-Path (Get-Location) 'node_modules\electron\install.js')
if ($LASTEXITCODE -ne 0) {
  Write-Output 'Electron installer could not read its cache; extracting the verified archive directly.'
  $zipPath = $finalPath.Replace('\', '/')
  $extractScript = "const {extract}=require('@electron-internal/extract-zip'); const fs=require('fs'); const p=require('path'); (async()=>{await extract('$zipPath',{dir:p.join(process.cwd(),'node_modules','electron','dist')}); fs.writeFileSync(p.join(process.cwd(),'node_modules','electron','path.txt'),'electron.exe')})().catch(e=>{console.error(e);process.exit(1)})"
  & node -e $extractScript
  if ($LASTEXITCODE -ne 0) {
    throw "Electron installation failed with exit code $LASTEXITCODE."
  }
}
