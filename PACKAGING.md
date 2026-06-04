# Packaging

This project is two apps:

1. Phone app: browser/PWA controller.
2. Desktop app: Windows server that receives phone commands and controls mouse/keyboard.

## Current App Mode

The phone app is now installable as a PWA.

Run the desktop server:

```powershell
cd "C:\Users\prith\Documents\Prithvi's Database\desktop-phone-control"
npm.cmd start
```

Open the printed LAN URL on your phone.

On Android Chrome:

1. Open the LAN URL.
2. Tap the three-dot menu.
3. Tap `Add to Home screen` or `Install app`.

On iPhone Safari:

1. Open the LAN URL.
2. Tap Share.
3. Tap `Add to Home Screen`.

## Windows Launcher

Double-click:

```text
start-desktop-control.cmd
```

Optional desktop shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```

## Real Windows App Path

For a proper `.exe` with a tray icon, use Electron or Tauri.

Recommended next step:

- Electron desktop shell
- tray icon with Start/Stop server
- copy phone URL + pairing code button
- visible connected-device list
- panic stop button
- local HTTPS

Do not add internet tunneling until authentication is stronger.

