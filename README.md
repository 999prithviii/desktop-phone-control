# Desktop Phone Control

Local-first phone controller for a Windows desktop.

This MVP turns your phone browser into a touchpad and keyboard for your laptop. It is designed for same-Wi-Fi use only.

## Features

- Pairing code printed in the desktop terminal.
- Live screen stream through browser WebRTC screen sharing.
- Desktop shortcut manager for phone buttons.
- Light/dark mode plus Mint, Coral, Sun, Cyan, and Pink accent variants.
- Phone touchpad for cursor movement.
- Adjustable mouse sensitivity from `0.8x` to `3.2x`.
- One-finger tap for left click.
- Two-finger tap for right click.
- Two-finger drag for scrolling.
- Long-press with one finger to drag, then lift to release.
- Left/right click.
- Hold-left mode for dragging windows.
- Scroll controls.
- Text typing.
- Browser/search helper: focus address bar, type, press Enter.
- Common keys: Escape, Space, Enter, `F`, `F11`, media play/pause, volume.

## Run

```powershell
cd "C:\Users\prith\Documents\Prithvi's Database\desktop-phone-control"
npm start
```

Open the printed LAN URL on your phone, then enter the pairing code shown in the terminal.

To stream your screen:

1. Open the printed `sender.html` URL on the laptop.
2. Click `Share Screen` and choose the screen/window in Chrome.
3. On the phone, tap `Connect Stream`.

The stream does not save screenshot files. Chrome captures frames, encodes them in memory, and sends them through WebRTC. The Node server stores only temporary connection metadata, not video frames.

To customize phone shortcuts:

1. Open the printed `admin.html` URL on the laptop.
2. Add button labels and key combos like `ctrl+s`, `alt+tab`, `win+d`, or `shift+f4`.
3. Click `Save`.
4. The paired phone app refreshes shortcut buttons automatically within a few seconds.

Saved shortcuts are stored locally in `data/shortcuts.json`. That file is gitignored.

On your phone, install it like an app:

- Android Chrome: three-dot menu -> `Add to Home screen` or `Install app`.
- iPhone Safari: Share -> `Add to Home Screen`.

On Windows, you can start it with:

```powershell
.\start-desktop-control.cmd
```

See [PACKAGING.md](PACKAGING.md) for turning this into a real `.exe` later.

## Response Timing

Mouse movement is optimized to batch phone input per animation frame and queue only the newest movement on the desktop side. For the lowest delay:

- Keep phone and laptop on the same 5 GHz Wi-Fi network.
- Turn off VPNs/proxies while using local control.
- Keep Windows battery saver off during testing.
- Keep the terminal window running; closing it stops the desktop controller.

## Environment

```powershell
$env:DESKCTL_HOST="0.0.0.0"
$env:DESKCTL_PORT="8789"
npm start
```

Defaults:

- `DESKCTL_HOST=0.0.0.0`
- `DESKCTL_PORT=8789`

## Security

Do not expose this app to the public internet.

Use it only on trusted local Wi-Fi. Anyone on the network who gets the pairing code can control mouse and keyboard until the server restarts.

Screen streaming also requires the private sender URL printed in the terminal and Chrome's screen-share permission on the laptop.

Shortcut editing requires the private admin URL printed in the terminal. Shortcuts are limited to key combos; the phone cannot save or run shell commands.

See [SECURITY.md](SECURITY.md).
