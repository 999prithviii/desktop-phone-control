$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Desktop Phone Control.lnk"
$TargetPath = Join-Path $ProjectRoot "start-desktop-control.cmd"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Start Desktop Phone Control"
$Shortcut.Save()

Write-Host "Created shortcut: $ShortcutPath"
