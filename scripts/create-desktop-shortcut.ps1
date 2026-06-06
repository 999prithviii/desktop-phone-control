$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Desktop Phone Control.lnk"
$LauncherPath = Join-Path $ProjectRoot "scripts\start-desktop-control-hidden.ps1"
$TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$IconPath = Join-Path $ProjectRoot "public\desktop-control.ico"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$LauncherPath`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Open Desktop Phone Control"
if (Test-Path $IconPath) {
  $Shortcut.IconLocation = "$IconPath,0"
}
$Shortcut.Save()

Write-Host "Created shortcut: $ShortcutPath"
