# Добавить SERPAPI_API_KEY на Vercel (все окружения).
# Использование: .\scripts\add-serpapi-key.ps1 -ApiKey "ваш_ключ"
param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey
)

$ErrorActionPreference = "Stop"
Push-Location (Split-Path $PSScriptRoot -Parent)

foreach ($env in @("production", "preview", "development")) {
  $ApiKey | npx vercel env add SERPAPI_API_KEY $env --yes
  Write-Host "SERPAPI_API_KEY added to $env"
}

Write-Host "Done. Redeploy: npx vercel --prod  or push to main"

Pop-Location
