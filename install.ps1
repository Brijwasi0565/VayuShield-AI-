<#
 VayuShield AI - one-step installer for Windows 10 / 11 (PowerShell).

 Usage (in PowerShell, inside this folder):
   .\install.ps1              install, build and start the app (http://localhost:3000)
   .\install.ps1 -NoStart     install and build only
   .\install.ps1 -Dev         install and start in development mode

 Easier: just double-click install.bat
#>
param(
  [switch]$NoStart,
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }
function Fail($message) { Write-Host "`n[ERROR] $message" -ForegroundColor Red; exit 1 }

Say 'VayuShield AI installer'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js is not installed.`nInstall Node.js 20 or newer (22 LTS recommended) from https://nodejs.org/ and run this again.`nTip: in PowerShell you can run: winget install OpenJS.NodeJS.LTS"
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Fail 'npm was not found. Please reinstall Node.js from https://nodejs.org/'
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) { Fail "Node.js $(node -v) is too old. Please install Node.js 20 or newer." }
Write-Host "Node.js $(node -v) and npm $(npm.cmd -v) found."

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env from .env.example (no API keys are needed for the core features).'
}

Say 'Installing dependencies (first run can take a minute)'
if (Test-Path 'package-lock.json') {
  npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { npm.cmd install --no-audit --no-fund }
} else {
  npm.cmd install --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. Check your internet connection and try again.' }

if (-not $Dev) {
  Say 'Building the app'
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Fail 'Build failed.' }
}

if ($NoStart) {
  Say 'Done. Start it later with: npm.cmd start   (or: npm.cmd run dev)'
  exit 0
}

$port = if ($env:PORT) { $env:PORT } else { '3000' }
Say "Starting VayuShield AI at http://localhost:$port  (press Ctrl+C to stop)"
Start-Job -ScriptBlock { Start-Sleep -Seconds 4; Start-Process "http://localhost:$using:port" } | Out-Null
if ($Dev) { npm.cmd run dev } else { npm.cmd start }
