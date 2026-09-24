$scriptPath = Join-Path $PSScriptRoot 'build-icon.mjs'
& (Join-Path $PSScriptRoot '..\node_modules\.bin\electron.cmd') $scriptPath
if ($LASTEXITCODE -ne 0) {
  throw "Icon generation failed with exit code $LASTEXITCODE."
}
