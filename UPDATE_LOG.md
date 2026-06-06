# Update Log

Desktop Phone Control is currently in **pre-release alpha**.

This log only includes product-safe public summaries. It does not include local machine paths, private URLs, tokens, pairing codes, personal files, or internal test data.

## Current Version

- `v0.2.0`

## v0.2.0 - Single-Use QR Connect

- Added the PC Connect dashboard with a single-use QR code, copyable phone link, expiry/status display, Generate New QR, and Share Screen access.
- Added guarded setup APIs using a private setup token generated on each server start.
- Added QR token pairing with five-minute expiry, one active token, immediate invalidation after use, and manual numeric pairing as fallback.
- Added phone heartbeat, inactivity detection, a visible Disconnect button, and safe mouse-button release on disconnect.
- Added same-run trusted auto-reconnect using an HttpOnly reconnect cookie, without using MAC addresses or writing trusted devices to disk.
- Added a Windows desktop shortcut installer wrapper.
- Added local vendored QR rendering with copyable-link fallback.
- Kept token-bearing setup, admin, sender, and pair-token URLs out of the service-worker cache.
- Added a mobile double-tap zoom guard for the controller UI.

## v0.0.0 -> v0.1.14 - Prototype Foundation

- Started the local-first desktop control concept.
- Established the basic idea: phone browser controls a desktop app over trusted local Wi-Fi.
- Early internal testing happened before the tracked update log starts.

## v0.1.15 - Initial Alpha App

- Added the first tracked desktop phone control app.
- Added pairing-based phone access.
- Added phone touchpad controls for mouse movement.
- Added basic mouse, keyboard, scroll, and text input actions.
- Added local-only security posture for trusted Wi-Fi testing.

## v0.1.16 - Documentation Safety Pass

- Removed local machine paths from documentation.
- Kept setup docs safer for private repo sharing.

## v0.1.17 - Shortcut Editor And Future Theme

- Added the main shortcut editor flow.
- Added custom shortcut support for phone buttons.
- Added the Future visual profile.

## v0.1.18 - Mint Theme

- Added the Mint artwork theme.
- Updated the visual palette for a softer light design profile.

## v0.1.19 - Pink Theme

- Added the Pink artwork theme.
- Expanded the available visual profiles.

## v0.1.20 - Cyan Theme

- Added the animated Cyan artwork theme.
- Added a darker futuristic cyan visual profile.

## v0.1.21 - Launch Protection Hardening

- Added proprietary license posture.
- Added release checklist.
- Expanded gitignore protection for local data, build outputs, screenshots, recordings, secrets, and certificates.
- Added public credits and version display.
- Confirmed private-source launch direction.

## v0.1.22 - Liquid Glass UI Polish

- Added SF-style font stack.
- Added liquid-glass styling for controls.
- Added pill-shaped buttons and softer control surfaces.
- Updated app/cache version so phones receive the new styling.

## v0.1.23 - Control Center Spacing

- Refined rounded page corners.
- Removed the sharp top accent strip.
- Improved spacing to feel closer to a phone control center.
- Updated footer into a rounded glass capsule.
- Fixed hidden admin/editor spacing behavior.

## v0.1.24 - Modular Shortcut Trays

- Replaced the long shortcut stack with accordion trays.
- Added trays for Core, Scroll, Browser, Media / Spotify, Edit / DaVinci, Text, Custom, and Admin.
- Added one-open-at-a-time tray behavior.
- Kept active trays from collapsing accidentally.
- Added phone-local tray order persistence.

## v0.1.25 - Tray Drag Fix

- Improved tray dragging on phones.
- Made the drag handle easier to grab.
- Added document-level pointer tracking during tray rearrangement.
- Locked page scrolling while dragging.

## v0.1.26 - Clipboard And File Transfer

- Added Clipboard / Files tray.
- Added phone text to PC clipboard.
- Added PC clipboard to phone display/copy.
- Added phone file/image drop to the PC.
- Added phone link open on desktop.
- Added file upload limits and ignored local drop folder.
- Added beginner startup guide for collaborators.

## v0.1.27 - QA Fixes

- Updated Windows startup docs to prefer `npm.cmd start` in PowerShell.
- Fixed first-run sensitivity so new phones start at `2.6x`.
- Kept saved sensitivity values working for existing users.
- Returned proper client errors for malformed JSON, oversized bodies, invalid shortcut saves, and invalid file drops.

## v0.1.28 - Touchpad Scroll Lock Fix

- Fixed a phone touchpad bug where interrupted two-finger scroll gestures could leave the app stuck scrolling.
- Added gesture cleanup for cancelled touches, lost pointer capture, page blur, hidden tabs, and page unload.
- Added stale gesture reset when a new primary touch begins after an interrupted touch sequence.
- Bumped the app cache so phones pull the new touchpad logic.

## v0.1.29 - Safety And Reliability Hardening

- Added per-device pairing-attempt throttling.
- Added global and shutdown mouse-button release handling.
- Fixed static-file path containment for encoded traversal paths.
- Made multi-file uploads validate fully before writing and roll back partial writes.
- Preserved full clipboard formats when temporary paste-based typing runs.
- Kept stream connection errors visible instead of replacing them with `stopped`.
- Fixed sender answer polling cleanup after a stream is stopped.
- Avoided caching token-bearing admin and sender URLs.
- Clarified that full PWA installation requires HTTPS outside localhost.

## v0.1.30 - Pairing Lockout Tightening

- Reduced the pairing failure allowance from eight attempts to three per device.
- Increased the pairing lockout window from one minute to five minutes.
- Further pairing attempts return `429` until the five-minute window expires.

## Notes For Testers

- This is not a finished public release.
- Use only on trusted local Wi-Fi.
- Do not expose the app to the public internet.
- Report bugs with the app version, operating system, browser, and exact steps to reproduce.
