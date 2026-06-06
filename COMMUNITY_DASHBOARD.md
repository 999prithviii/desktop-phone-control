# Community Dashboard

Desktop Phone Control is in **pre-release alpha**. This page is the public tester-facing dashboard for what was found, what was fixed, and what still needs controlled testing.

No private paths, pairing codes, tokens, screenshots, or personal test data are included here.

## Current Build

- Version: `v0.2.0`
- Platform: Windows desktop control
- Startup recommendation on Windows PowerShell: `npm.cmd start`
- Safety rule: trusted local Wi-Fi only

## Latest QA Findings And Fixes

### Fixed In v0.2.0

| Area | What Was Found | What Was Fixed | Status |
| --- | --- | --- | --- |
| Phone connect | Manual URL/code pairing was clunky for normal testers. | Added a PC Connect dashboard with a single-use QR code, copyable link, expiry/status, and Generate New QR. | Fixed |
| QR reuse | A scanned QR should not remain usable by someone else. | QR tokens now expire, invalidate on successful pairing, and regenerate one-at-a-time. | Fixed |
| Reconnect | Closing the phone browser forced a fresh scan even during the same app run. | Added same-run trusted auto-reconnect using a server-issued HttpOnly cookie. | Fixed |
| Disconnect | Intentional logout needed to be clearer and safer. | Added a phone Disconnect button that clears session/reconnect cookies, releases held mouse buttons, and creates a fresh QR. | Fixed |
| Screen share | The desktop stream sender link was hidden in terminal output. | Added Share Screen and copy sender link actions to the Connect dashboard. | Fixed |
| Mobile browser zoom | Fast double taps on controls could zoom the whole phone browser. | Added controller touch-action hints and a double-tap zoom guard. | Fixed |

### Fixed In v0.1.30

| Area | What Was Found | What Was Fixed | Status |
| --- | --- | --- | --- |
| Pairing | Eight attempts and a one-minute window were too permissive. | Devices are now locked out after three failed codes within five minutes. | Fixed |

### Fixed In v0.1.29

| Area | What Was Found | What Was Fixed | Status |
| --- | --- | --- | --- |
| Pairing | Pairing attempts had no throttle. | Added a per-device attempt limit and `429` retry response. | Fixed |
| Mouse safety | Held buttons could survive interrupted phone sessions. | Added lifecycle, panic, and server-shutdown release handling. | Fixed |
| Static files | A prefix-only path check could allow encoded traversal into similarly named sibling folders. | Replaced it with a path-relative containment check. | Fixed |
| File drops | A failed multi-file request could leave earlier files behind. | All files are validated before writing, with rollback on write failure. | Fixed |
| Clipboard | Paste-based typing restored only text clipboard data. | Full available clipboard formats are captured and restored. | Fixed |
| Stream UI | Connection errors were immediately replaced with `stopped`. | Cleanup now preserves the useful error message. | Fixed |
| PWA docs | Plain HTTP LAN startup was described as a full PWA install path. | Docs now distinguish home-screen shortcuts from HTTPS-backed PWA installation. | Fixed |

### Fixed In v0.1.28

| Area | What Was Found | What Was Fixed | Status |
| --- | --- | --- | --- |
| Touchpad gestures | A phone touchpad session could get stuck scrolling after an interrupted two-finger gesture, blocking normal mouse movement. | Cancelled/lost touch events now fully reset the gesture state, clear pending scroll/move values, and release active drag state safely. | Fixed |

### Fixed In v0.1.27

| Area | What Was Found | What Was Fixed | Status |
| --- | --- | --- | --- |
| Windows startup | PowerShell can block plain `npm start` because it may resolve to `npm.ps1`. | Docs now recommend `npm.cmd start`, while `start-desktop-control.cmd` remains the easiest option. | Fixed |
| Sensitivity default | Fresh phone sessions could start at `0.8x` instead of the intended `2.6x`. | Sensitivity now only reads local storage when a saved value exists. New users get `2.6x`; existing saved values still persist. | Fixed |
| Bad JSON | Malformed JSON returned `500`, making client mistakes look like server crashes. | Malformed JSON now returns `400`. | Fixed |
| Oversized request body | Oversized bodies returned `500`. | Oversized bodies now return `413`. | Fixed |
| Invalid shortcut saves | Invalid admin shortcut payloads returned `500`. | Invalid shortcut saves now return `400`. | Fixed |
| Invalid file drops | Empty or invalid file-drop requests returned `500`. | Invalid file drops now return `400`. | Fixed |
| Public QA notes | Testers needed a clean handoff for what happened and what to test next. | Added `QA_HANDOFF.md`. | Fixed |

## Verified Safe Areas

These were tested without intentionally moving the mouse, typing, changing clipboard contents, or accepting screen-share permission:

- Main app loads.
- Sender page loads.
- Static assets serve correctly.
- Missing static files return `404`.
- Static path traversal attempts return `403`.
- Wrong pairing code shows a clear error.
- Correct pairing switches to the controls screen.
- Admin route rejects bad tokens.
- Admin route accepts the valid printed token.
- Stream signaling accepts valid offer/answer shapes and rejects invalid ones.
- Mixed API load tests completed without failures in the tested environment.

## Needs Controlled Testing

These features affect the active desktop and should only be tested with the PC owner present:

- Mouse movement
- Left/right click
- Hold mouse button
- Scroll
- Keyboard shortcuts
- Text typing
- Search/open-link actions
- Clipboard set/get
- Shortcut execution
- Screen sharing

Recommended controlled setup:

1. Open a disposable Notepad window.
2. Pair the phone.
3. Test mouse movement in a safe blank area.
4. Test typing only into Notepad.
5. Back up the clipboard before clipboard tests and restore it afterward.
6. Use dummy files for file-drop tests.
7. Share only a chosen test window during stream tests, then stop sharing.

## Known Limits

- Full desktop control is currently Windows-only.
- Mac support needs a macOS helper later.
- The app is not packaged as a polished installer yet.
- Anyone on the same trusted network with the pairing code can control the desktop until the server restarts.
- Do not expose the app to the public internet.

## Tester Checklist

Before reporting a bug, include:

- App version
- Windows version
- Browser name and version
- Phone model/browser
- Whether PC and phone were on the same Wi-Fi
- Exact steps to reproduce
- What you expected
- What happened

## Links

- Setup guide: `README.md`
- QA handoff: `QA_HANDOFF.md`
- Product update log: `UPDATE_LOG.md`
- Security notes: `SECURITY.md`
- Release checks: `RELEASE_CHECKLIST.md`
