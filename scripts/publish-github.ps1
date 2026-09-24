<#
.SYNOPSIS
  把当前仓库的 open-source 分支发布到你的 GitHub 账号。

.DESCRIPTION
  发布前会做三项检查：
    1. gh 是否已登录 GitHub；
    2. 待发布的分支里是否存在手册 / 密钥 / 本机路径；
    3. 目标仓库是否已存在（不存在则创建）。

  仓库默认创建为 public。若只想自己可见，加 -Private。

.EXAMPLE
  gh auth login -h github.com
  powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1
#>
param(
  [string]$Repo = "stm32-manual-agent",
  [string]$Branch = "open-source",
  [string]$Remote = "origin",
  [switch]$Private
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "未找到 gh CLI，请先安装：https://cli.github.com/"
}

Write-Host "检查 GitHub 登录状态..." -ForegroundColor Cyan
gh auth status 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "gh 未登录或 token 已失效，请先执行：gh auth login -h github.com"
}

$owner = (gh api user --jq ".login").Trim()
if (-not $owner) {
  throw "无法获取 GitHub 账号名。"
}

Write-Host "检查 $Branch 分支是否包含敏感内容..." -ForegroundColor Cyan
$tracked = git ls-tree -r --name-only $Branch
$suspicious = $tracked | Select-String -Pattern `
  'resources/library/|^data/|^artifacts/|^release/|^out/|library-manifest\.local\.json|secret\.bin|(^|/)settings\.json$'
if ($suspicious) {
  Write-Host $suspicious
  throw "分支中包含疑似手册 / 私密文件，已中止发布。"
}

$keyHits = git grep -n -I -e "sk-[A-Za-z0-9]\{16,\}" $Branch 2>$null
if ($keyHits) {
  Write-Host $keyHits
  throw "分支中检测到疑似 API Key，已中止发布。"
}
Write-Host "敏感内容检查通过。" -ForegroundColor Green

$visibility = if ($Private) { "--private" } else { "--public" }
gh repo view "$owner/$Repo" *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "创建仓库 $owner/$Repo ..." -ForegroundColor Cyan
  gh repo create "$owner/$Repo" $visibility --description "Local-first STM32 manual knowledge base agent with page-level citations"
} else {
  Write-Host "仓库已存在，将直接推送。" -ForegroundColor Yellow
}

$remoteUrl = "https://github.com/$owner/$Repo.git"
$existing = git remote
if ($existing -contains $Remote) {
  git remote set-url $Remote $remoteUrl
} else {
  git remote add $Remote $remoteUrl
}

Write-Host "推送到 $remoteUrl ..." -ForegroundColor Cyan
git push -u $Remote "${Branch}:main"

Write-Host ""
Write-Host "完成：https://github.com/$owner/$Repo" -ForegroundColor Green
