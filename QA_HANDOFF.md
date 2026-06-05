# Desktop Phone Control QA Handoff

This file explains the latest QA issue, what changed, and how another tester or Codex agent should verify it.

## Current State

- Project status: pre-release alpha
- Current version: `v0.1.27`
- Source repo should remain private.
- Recommended Windows startup command is:

```powershell
npm.cmd start
```

The easiest Windows startup path is still double-clicking:

```text
start-desktop-control.cmd
```

## Issue Summary

A tester found three practical problems during Windows QA:

1. PowerShell can block plain `npm start`.
2. New phones could show sensitivity as `0.8x` instead of the intended `2.6x`.
3. Some bad client input returned `500` server errors even though the server was not actually crashing.

## Root Causes

### PowerShell Startup

On some Windows machines, PowerShell resolves `npm` to `npm.ps1`. If script execution is blocked, this fails before the app starts.

Use `npm.cmd start` in PowerShell because it calls the command shim directly and avoids the script-policy problem.

### Sensitivity Default

The phone app read sensitivity like this:

```js
Number(localStorage.getItem("deskctl:sensitivity"))
```

When no saved value exists, `localStorage.getItem(...)` returns `null`. `Number(null)` becomes `0`, and the app clamped it to the minimum `0.8x`.

The fix checks whether the saved value exists before converting it to a number.

### Client Errors Returning 500

Malformed JSON, oversized request bodies, invalid shortcut saves, and invalid file drops are user/client input errors. They should return `400` or `413`, not `500`.

The backend now uses a small HTTP error path so expected validation failures do not look like server crashes.

## Fixes Applied In v0.1.27

- README now recommends `npm.cmd start` for PowerShell.
- First-run sensitivity now stays at the intended default `2.6x`.
- Existing saved sensitivity values still persist.
- Malformed JSON returns `400`.
- Oversized request bodies return `413`.
- Invalid admin shortcut saves return `400`.
- Invalid file drops return `400`.
- App/cache version was bumped to force phone browsers to refresh frontend logic.

## Verification Steps

Start the app:

```powershell
npm.cmd start
```

Then verify:

1. Open `http://127.0.0.1:8789/` on the PC.
2. Enter a wrong pairing code and confirm it shows `wrong pairing code`.
3. Pair with the printed code.
4. In a fresh browser profile or after clearing site data, confirm sensitivity starts at `2.6x`.
5. Move the sensitivity slider, refresh, and confirm the saved value persists.
6. Open the printed admin URL and confirm shortcut editing still loads.
7. Open the printed sender URL and confirm it shows idle state before screen sharing.

## Safe API Checks

These checks should not move the mouse, type, change clipboard, or affect the desktop:

- `GET /`
- `GET /api/status`
- `POST /api/pair` with wrong code
- `POST /api/shortcuts/list` after pairing
- `POST /api/stream/status` after pairing
- `POST /api/admin/shortcuts/list` with bad token
- `POST /api/admin/shortcuts/list` with valid token

Expected client error behavior:

- Bad JSON returns `400`.
- Too-large body returns `413`.
- Invalid shortcut save returns `400`.
- Empty file drop returns `400`.

## Controlled Hardware Test Only

Only test these when the person using the PC agrees, because they can affect the active desktop:

- `/api/move`
- `/api/click`
- `/api/mouse`
- `/api/scroll`
- `/api/key`
- `/api/type`
- `/api/search`
- `/api/open-link`
- `/api/clipboard/set`
- `/api/clipboard/get`
- `/api/shortcuts/run`

Recommended controlled setup:

1. Open a disposable Notepad window.
2. Pair the phone.
3. Test mouse movement in a safe blank area.
4. Test typing into Notepad only.
5. Back up clipboard before clipboard tests and restore it afterward.
6. Use generated dummy files for file-drop tests.
7. Accept screen share only for a chosen test window, then stop sharing.

## Notes For Other Codex Agents

- Do not expose this app outside trusted local Wi-Fi.
- Do not commit `data/`, dropbox files, tokens, local configs, screenshots, recordings, or builds.
- Run the leak scans from `RELEASE_CHECKLIST.md` before committing.

- Keep commits authored as:

```text
999prithviii <279659972+999prithviii@users.noreply.github.com>
```
