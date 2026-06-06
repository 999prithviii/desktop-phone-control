# Desktop Phone Control

Local-first phone controller for a Windows desktop.

Built by Prithvi — Designer & Builder  
GitHub: [@999prithviii](https://github.com/999prithviii)  
Version: `0.2.0`

Community dashboard: [COMMUNITY_DASHBOARD.md](COMMUNITY_DASHBOARD.md)
Update log: [UPDATE_LOG.md](UPDATE_LOG.md)

## Status

This project is in **pre-release alpha**.

It is an early private build for testing and iteration. Expect rough edges, UI changes, bugs, and missing installer polish. Do not treat this as a finished public product yet.

This MVP turns your phone browser into a touchpad and keyboard for your laptop. It is designed for same-Wi-Fi use only.

## Features

- Local Wi-Fi phone controller for Windows mouse, keyboard, scrolling, typing, and shortcuts.
- PC Connect dashboard with a single-use QR code, manual pairing fallback, and same-run trusted reconnect.
- Touchpad gestures for left/right click, scrolling, dragging, hold-left, and adjustable sensitivity.
- Live screen viewing through browser WebRTC screen sharing.
- Draggable shortcut trays for browser, media, editing, text, custom buttons, and admin-managed shortcuts.
- Clipboard, link, and file handoff between phone and PC.
- Light/dark mode with Mint, Coral, Sun, Future, Cyan, and Pink visual profiles.

## Beginner Startup Guide

This guide is for friends/collaborators who do not use PowerShell every day.

### What This App Does

Desktop Phone Control lets your phone act like a small remote for a Windows laptop. Your laptop runs the desktop controller, and your phone opens the local phone app in a browser.

After pairing, the phone can move the mouse, click, scroll, type text, run shortcuts, transfer clipboard text/files, and connect to a live screen stream.

### Before You Start

You need:

- A Windows PC.
- A phone on the same Wi-Fi as the PC.
- Google Chrome or another modern browser.
- Node.js `22` or newer installed on the PC.
- Access to this GitHub repository.

Mac note: Mac users can clone/read the repo, but full desktop control is currently Windows-only. Mac support needs a macOS helper later.

### Step 1: Install Node.js

1. Go to [nodejs.org](https://nodejs.org/).
2. Download the current LTS version.
3. Install it with the default options.
4. Restart PowerShell, Terminal, or your PC if `npm` is not recognized later.

### Step 2: Get The Project

If you use GitHub Desktop:

1. Open GitHub Desktop.
2. Click `File` -> `Clone repository`.
3. Choose this repo: `999prithviii/desktop-phone-control`.
4. Click `Clone`.

If you use the command line:

```powershell
git clone https://github.com/999prithviii/desktop-phone-control.git
cd desktop-phone-control
```

### Step 3: Start The App On Windows

Easiest option:

1. Open the project folder.
2. Double-click `start-desktop-control.cmd`.
3. Keep the black terminal window open.

If double-click does not work, use PowerShell:

```powershell
cd path\to\desktop-phone-control
npm.cmd start
```

Plain `npm start` can be blocked on some Windows machines because PowerShell may resolve `npm` to `npm.ps1`. `npm.cmd start` avoids that script-policy problem.

The terminal will print:

- a pairing code
- one or more phone URLs
- a private connect dashboard URL with a single-use QR code
- a private admin URL
- a private stream sender URL

### Step 4: Connect Your Phone

1. Make sure the phone and PC are on the same Wi-Fi.
2. Use the Connect dashboard that opens on the PC.
3. Scan the QR code with your phone. The QR is single-use and expires after a few minutes.
4. If the QR does not work, click `Generate New QR` on the PC or enter the printed pairing code manually.
5. Keep the terminal open while using the app.

Use the LAN URL, not `127.0.0.1`. `127.0.0.1` only works on the PC itself.

If the phone browser closes or goes inactive, reopen the phone controller from the same phone during the same server run. The app will try to reconnect automatically. Tapping `Disconnect` intentionally revokes that trust and requires a fresh QR.

### Step 5: Common First-Run Problems

- `npm` is not recognized: Node.js is not installed, or the terminal needs to be restarted.
- PowerShell script policy error: use `start-desktop-control.cmd` or run `npm.cmd start`.
- Phone cannot connect: check same Wi-Fi, allow the Windows Firewall prompt for Node.js, and use the LAN URL.
- App looks outdated: refresh the phone browser, close/reopen the PWA, or restart the server to clear old cache.
- Closing the terminal stops the app: this is normal in the alpha build.

### Collaborator Access

This source repo should stay private.

When adding friends later, use GitHub `Write` access by default. `Write` lets them push code branches without changing repo settings. Do not give `Admin` access unless they are trusted to manage repository settings and collaborators.

## Run

```powershell
cd path\to\desktop-phone-control
npm.cmd start
```

Use the Connect dashboard that opens on the PC, then scan the single-use QR code with your phone. If QR pairing fails, open the printed LAN URL on your phone and enter the pairing code shown in the terminal.

To stream your screen:

1. Open the printed `sender.html` URL on the laptop.
2. Click `Share Screen` and choose the screen/window in Chrome.
3. On the phone, tap `Connect Stream`.

The stream does not save screenshot files. Chrome captures frames, encodes them in memory, and sends them through WebRTC. The Node server stores only temporary connection metadata, not video frames.

To customize phone shortcuts:

1. Open the printed `?admin=...` URL on the laptop.
2. Add button labels and key combos like `ctrl+s`, `alt+tab`, `win+d`, or `shift+f4`.
3. Click `Save`.
4. The paired phone app refreshes shortcut buttons automatically within a few seconds.

Saved shortcuts are stored locally in `data/shortcuts.json`. That file is gitignored.

To transfer clipboard text, files, or links:

1. Pair the phone.
2. Open the `Clipboard / Files` tray.
3. Use `Set PC Clipboard`, `Get PC Clipboard`, `Send Files`, or `Open`.

Dropped files are saved on the PC in `data/dropbox/`. That folder is gitignored. Current limits are 5 files, 8 MB per file, and 16 MB total per upload.

On your phone, you can add the controller to your home screen:

- Android Chrome: three-dot menu -> `Add to Home screen`.
- iPhone Safari: Share -> `Add to Home Screen`.

The printed LAN URL uses plain HTTP. Browsers require HTTPS for service workers and full PWA installation outside localhost, so the LAN version may be added as a browser shortcut rather than a fully offline-capable PWA.

On Windows, you can start it with:

```powershell
.\start-desktop-control.cmd
```

To create a Windows desktop shortcut, double-click:

```text
install-desktop-shortcut.cmd
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
npm.cmd start
```

Defaults:

- `DESKCTL_HOST=0.0.0.0`
- `DESKCTL_PORT=8789`

## Security

Do not expose this app to the public internet.

Use it only on trusted local Wi-Fi. Anyone on the network who gets the pairing code can control mouse and keyboard until the server restarts.

QR pairing uses a short-lived, single-use token. It is safer than reusing the numeric pairing code, but it still must be treated as trusted-local-network only.

Auto-reconnect uses a same-run trusted-device cookie. It does not use MAC addresses because phone browsers do not expose them.

Screen streaming also requires the private sender URL printed in the terminal and Chrome's screen-share permission on the laptop.

Shortcut editing requires the private admin URL printed in the terminal. Shortcuts are limited to key combos; the phone cannot save or run shell commands.

See [SECURITY.md](SECURITY.md).

## License

This project is proprietary. See [LICENSE.md](LICENSE.md). Do not copy, modify, redistribute, or use commercially without permission.

## Credits

Built by Prithvi — Designer & Builder  
GitHub: [@999prithviii](https://github.com/999prithviii)

## Contributors

- [@danielgoleman97-lab](https://github.com/danielgoleman97-lab) - QA testing and security review
- [@mvzy21](https://github.com/mvzy21) - QA testing
