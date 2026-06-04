# Release Checklist

Run this before every push, build, or tester release.

## Repo Privacy

- Confirm the GitHub repository is private.
- Confirm only trusted collaborators have access.
- Confirm `main` is protected from force pushes and deletion.

## Local Leak Audit

```powershell
git status --short
git ls-files
rg -n "C:\\\\|Users" --glob "!RELEASE_CHECKLIST.md"
rg -n "api[_-]?key\\s*[=:]|password\\s*[=:]|secret\\s*[=:]|ghp_|github_pat|sk-" --glob "!RELEASE_CHECKLIST.md"
git status --ignored --short
```

Expected:

- No personal machine paths in tracked files.
- No API keys, passwords, tokens, or credentials.
- Public creator credits like `Prithvi` and `@999prithviii` are allowed.
- `data/*.json` remains ignored.
- Build outputs, screenshots, recordings, and local certificates remain ignored.

## Build Sharing

- Share installers/builds with testers, not the source repo.
- Do not publish this source repository as the product landing page.
- Use screenshots, demos, and a separate marketing page for public launch.
