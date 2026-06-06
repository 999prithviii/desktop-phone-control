# Packaging

This project is two apps:

1. Phone app: browser/PWA controller.
2. Desktop app: Windows server that receives phone commands and controls mouse/keyboard.

## Current App Mode

The phone app is a browser controller with a web app manifest.

Run the desktop server:

```powershell
cd path\to\desktop-phone-control
npm.cmd start
```

Open the printed LAN URL on your phone.

The easier connection path is:

1. Double-click `start-desktop-control.cmd`.
2. Use the Connect dashboard that opens on the PC.
3. Scan the single-use QR code from the phone.
4. Add the paired phone controller to the home screen.

The QR code expires after a few minutes and cannot be reused after a successful pairing. If it fails, click `Generate New QR` on the PC.

On Android Chrome:

1. Open the LAN URL.
2. Tap the three-dot menu.
3. Tap `Add to Home screen`.

On iPhone Safari:

1. Open the LAN URL.
2. Tap Share.
3. Tap `Add to Home Screen`.

The current LAN URL is plain HTTP. A full service-worker-backed PWA requires HTTPS outside localhost. Until local HTTPS is added, home-screen behavior depends on the phone/browser and may be a shortcut rather than an offline-capable install.

## Windows Launcher

Double-click:

```text
start-desktop-control.cmd
```

Optional desktop shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```

Easiest shortcut installer:

```text
install-desktop-shortcut.cmd
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
