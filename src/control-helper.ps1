Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DesktopControlNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010
$MOUSEEVENTF_WHEEL = 0x0800
$KEYEVENTF_KEYUP = 0x0002
$CLICK_DELAY_MS = 12
$KEY_TAP_DELAY_MS = 12
$CLIPBOARD_SET_DELAY_MS = 30
$CLIPBOARD_RESTORE_DELAY_MS = 70

$KeyMap = @{
  "esc" = 0x1B
  "enter" = 0x0D
  "space" = 0x20
  "tab" = 0x09
  "backspace" = 0x08
  "delete" = 0x2E
  "home" = 0x24
  "end" = 0x23
  "pageup" = 0x21
  "pagedown" = 0x22
  "insert" = 0x2D
  "capslock" = 0x14
  "left" = 0x25
  "up" = 0x26
  "right" = 0x27
  "down" = 0x28
  "playpause" = 0xB3
  "volumeup" = 0xAF
  "volumedown" = 0xAE
  "mute" = 0xAD
}

foreach ($char in [char[]]"abcdefghijklmnopqrstuvwxyz") {
  $KeyMap[[string]$char] = [int][char]::ToUpperInvariant($char)
}

foreach ($number in 0..9) {
  $KeyMap[[string]$number] = 0x30 + $number
}

foreach ($number in 1..12) {
  $KeyMap["f$number"] = 0x6F + $number
}

$ModifierMap = @{
  "ctrl" = 0x11
  "alt" = 0x12
  "shift" = 0x10
  "win" = 0x5B
}

function Write-Response {
  param(
    [Parameter(Mandatory = $true)] [int] $Id,
    [Parameter(Mandatory = $true)] [bool] $Ok,
    [object] $Data = $null,
    [string] $ErrorMessage = $null
  )

  $payload = @{
    id = $Id
    ok = $Ok
    data = $Data
    error = $ErrorMessage
  } | ConvertTo-Json -Compress -Depth 5

  [Console]::Out.WriteLine($payload)
  [Console]::Out.Flush()
}

function Tap-Key {
  param([int] $VirtualKey)
  [DesktopControlNative]::keybd_event([byte]$VirtualKey, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds $KEY_TAP_DELAY_MS
  [DesktopControlNative]::keybd_event([byte]$VirtualKey, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Key-Down {
  param([int] $VirtualKey)
  [DesktopControlNative]::keybd_event([byte]$VirtualKey, 0, 0, [UIntPtr]::Zero)
}

function Key-Up {
  param([int] $VirtualKey)
  [DesktopControlNative]::keybd_event([byte]$VirtualKey, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Send-Shortcut {
  param([string] $Key)

  $normalized = $Key.ToLowerInvariant().Replace(" ", "")
  $parts = @($normalized -split "\+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($parts.Count -lt 1 -or $parts.Count -gt 4) {
    throw "Unsupported key combo: $Key"
  }

  $modifiers = New-Object System.Collections.Generic.List[int]
  $baseKey = $null

  foreach ($part in $parts) {
    if ($ModifierMap.ContainsKey($part)) {
      if ($modifiers.Contains([int]$ModifierMap[$part])) {
        throw "Duplicate modifier: $part"
      }
      $modifiers.Add([int]$ModifierMap[$part])
      continue
    }

    if (-not $KeyMap.ContainsKey($part)) {
      throw "Unsupported key: $part"
    }

    if ($null -ne $baseKey) {
      throw "Shortcut can only include one non-modifier key"
    }

    $baseKey = [int]$KeyMap[$part]
  }

  if ($null -eq $baseKey) {
    throw "Shortcut needs one non-modifier key"
  }

  try {
    foreach ($modifier in $modifiers) {
      Key-Down $modifier
    }
    Tap-Key $baseKey
  } finally {
    for ($index = $modifiers.Count - 1; $index -ge 0; $index--) {
      Key-Up $modifiers[$index]
    }
  }
}

function Send-Text {
  param([string] $Text)

  $previous = $null
  $hasPrevious = $false
  try {
    $previous = [System.Windows.Forms.Clipboard]::GetText()
    $hasPrevious = $true
  } catch {
    $hasPrevious = $false
  }

  [System.Windows.Forms.Clipboard]::SetText($Text)
  Start-Sleep -Milliseconds $CLIPBOARD_SET_DELAY_MS
  Key-Down 0x11
  Tap-Key 0x56
  Key-Up 0x11
  Start-Sleep -Milliseconds $CLIPBOARD_RESTORE_DELAY_MS

  if ($hasPrevious) {
    try {
      [System.Windows.Forms.Clipboard]::SetText($previous)
    } catch {}
  }
}

while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ([string]::IsNullOrWhiteSpace($line)) {
    continue
  }

  try {
    $cmd = $line | ConvertFrom-Json
    $id = [int]$cmd.id
    $action = [string]$cmd.action

    if ($action -eq "move") {
      $point = New-Object DesktopControlNative+POINT
      [void][DesktopControlNative]::GetCursorPos([ref]$point)
      $x = $point.X + [int]$cmd.dx
      $y = $point.Y + [int]$cmd.dy
      [void][DesktopControlNative]::SetCursorPos($x, $y)
      Write-Response -Id $id -Ok $true -Data @{ x = $x; y = $y }
      continue
    }

    if ($action -eq "click") {
      if ([string]$cmd.button -eq "right") {
        [DesktopControlNative]::mouse_event($MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds $CLICK_DELAY_MS
        [DesktopControlNative]::mouse_event($MOUSEEVENTF_RIGHTUP, 0, 0, 0, [UIntPtr]::Zero)
      } else {
        [DesktopControlNative]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds $CLICK_DELAY_MS
        [DesktopControlNative]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
      }
      Write-Response -Id $id -Ok $true
      continue
    }

    if ($action -eq "mouse") {
      $button = [string]$cmd.button
      $kind = [string]$cmd.kind
      if ($button -eq "right") {
        $flag = if ($kind -eq "up") { $MOUSEEVENTF_RIGHTUP } else { $MOUSEEVENTF_RIGHTDOWN }
      } else {
        $flag = if ($kind -eq "up") { $MOUSEEVENTF_LEFTUP } else { $MOUSEEVENTF_LEFTDOWN }
      }
      [DesktopControlNative]::mouse_event($flag, 0, 0, 0, [UIntPtr]::Zero)
      Write-Response -Id $id -Ok $true
      continue
    }

    if ($action -eq "scroll") {
      [DesktopControlNative]::mouse_event($MOUSEEVENTF_WHEEL, 0, 0, [int]$cmd.amount, [UIntPtr]::Zero)
      Write-Response -Id $id -Ok $true
      continue
    }

    if ($action -eq "key") {
      Send-Shortcut ([string]$cmd.key).ToLowerInvariant()
      Write-Response -Id $id -Ok $true
      continue
    }

    if ($action -eq "type") {
      Send-Text ([string]$cmd.text)
      Write-Response -Id $id -Ok $true
      continue
    }

    throw "Unknown action: $action"
  } catch {
    $fallbackId = 0
    try { $fallbackId = [int](($line | ConvertFrom-Json).id) } catch {}
    Write-Response -Id $fallbackId -Ok $false -ErrorMessage $_.Exception.Message
  }
}
