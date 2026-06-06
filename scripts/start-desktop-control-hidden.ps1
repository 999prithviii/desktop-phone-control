$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DataDir = Join-Path $ProjectRoot "data"
$RuntimePath = Join-Path $DataDir "runtime.json"
$LogPath = Join-Path $DataDir "launcher.log"

function Write-LauncherLog($Message) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $LogPath -Value "[$timestamp] $Message"
}

function Test-ProcessRunning($ProcessId) {
  if (-not $ProcessId) { return $false }
  try {
    $process = Get-Process -Id ([int]$ProcessId) -ErrorAction Stop
    return -not $process.HasExited
  } catch {
    return $false
  }
}

function Open-Url($Url) {
  if (-not $Url) { return $false }
  Start-Process -FilePath $Url
  return $true
}

try {
  if (Test-Path $RuntimePath) {
    $runtime = Get-Content -Raw $RuntimePath | ConvertFrom-Json
    if ((Test-ProcessRunning $runtime.pid) -and (Open-Url $runtime.setupUrl)) {
      Write-LauncherLog "Opened running dashboard: $($runtime.setupUrl)"
      exit 0
    }
  }

  $nodeCommand = Get-Command node.exe -ErrorAction Stop
  Start-Process `
    -FilePath $nodeCommand.Source `
    -ArgumentList "src/server.js" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden

  Write-LauncherLog "Started Desktop Phone Control hidden server."
} catch {
  Write-LauncherLog "Launcher failed: $($_.Exception.Message)"
  $safeProjectRoot = $ProjectRoot.Replace("'", "''")
  $safeMessage = $_.Exception.Message.Replace("'", "''")
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-NoExit",
    "-Command",
    "Set-Location -LiteralPath '$safeProjectRoot'; Write-Host 'Desktop Phone Control launcher failed:'; Write-Host '$safeMessage'; Write-Host ''; Write-Host 'Try running .\start-desktop-control.cmd for details.'"
  )
}
