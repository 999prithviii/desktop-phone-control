# Security

This app controls your mouse and keyboard. Treat it as high-risk local tooling.

## Hard Rules

- Keep the source repository private before launch.
- Share installer/build artifacts with testers, not the source repo.
- Do not port-forward this app.
- Do not put it behind a public tunnel like ngrok or Cloudflare Tunnel unless we redesign auth first.
- Do not leave it running unattended.
- Restart the server to rotate the pairing token/code.
- Use only on trusted Wi-Fi.
- Do not type passwords/API keys through it unless you accept the risk.
- Do not share your full desktop if you only need to share one app window.
- Do not put secrets in shortcut labels.

## Current Protection

- Proprietary license and private-source launch posture.
- Random pairing code on every server start.
- Random session token stored as an HTTP-only cookie.
- API actions require pairing.
- Basic same-origin checks.
- Local command allowlist only: mouse, scroll, key, type.
- No file browsing.
- No shell command execution from the phone.
- Custom shortcuts are limited to allowlisted key combinations.
- Saved shortcut data is local and gitignored.
- Screen streaming uses browser WebRTC screen sharing.
- Screen frames are not written to disk by this app.
- The server stores only temporary WebRTC offer/answer metadata in memory.
- No persistence or auto-start.

## Known Limits

- HTTP is unencrypted on the LAN.
- Pairing code can be used by another device on the same network while the server is running.
- The stream sender URL printed in the terminal can start a screen-sharing session if opened on the laptop.
- The desktop `?admin=...` URL printed in the terminal can edit phone shortcut buttons while the server is running.
- Text typing uses the Windows clipboard temporarily, then attempts to restore the old clipboard text.
- No per-device revoke yet.

## Safer Future Version

- Signed installer builds for tester distribution.
- HTTPS with a local certificate.
- Device allowlist.
- Pairing QR code with short expiry.
- Visible connected-device list.
- Panic button.
- Encrypted WebRTC signaling.
- Stream viewer allowlist.
- Per-action permission scopes.
