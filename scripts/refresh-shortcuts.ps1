param(
  [switch]$RestartExplorer
)

$installDir = Join-Path $env:LOCALAPPDATA 'Programs\manual-lens'
$iconPath = Join-Path $installDir 'app-icon.ico'
$sourceIcon = Join-Path $PSScriptRoot '..\resources\icon.ico'

if (-not (Test-Path -LiteralPath $iconPath) -and (Test-Path -LiteralPath $sourceIcon)) {
  Copy-Item -LiteralPath $sourceIcon -Destination $iconPath -Force
}

if (-not (Test-Path -LiteralPath $iconPath)) {
  throw "Icon file not found: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcuts = @(
  (Join-Path $env:USERPROFILE 'Desktop\STM32 手册智能体.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\STM32 手册智能体.lnk')
)

foreach ($shortcutPath in $shortcuts) {
  if (-not (Test-Path -LiteralPath $shortcutPath)) {
    continue
  }
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.IconLocation = "$iconPath,0"
  $shortcut.Save()
}

Start-Process -FilePath "$env:WINDIR\System32\ie4uinit.exe" -ArgumentList '-show' -WindowStyle Hidden -Wait

if ($RestartExplorer) {
  Start-Process -FilePath "$env:WINDIR\System32\ie4uinit.exe" -ArgumentList '-ClearIconCache' -WindowStyle Hidden -Wait
  Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
  Start-Process -FilePath "$env:WINDIR\explorer.exe"
}

Write-Output "Shortcut icons refreshed from $iconPath"
