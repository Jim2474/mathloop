# MathLoop macOS Port Handoff

**Branch:** `codex/macos-port-prep`  
**Prepared on:** 2026-06-09  
**Status:** Windows-side preparation is complete; final `.app`/`.dmg`, signing, notarization, and real macOS runtime checks still require a Mac.

## What This Branch Prepares

- Adds a platform-specific Tauri config at `src-tauri/tauri.macos.conf.json`.
- Adds a macOS icon bundle at `src-tauri/icons/icon.icns`.
- Changes the Rust data directory resolver so macOS stores user data in `~/Library/Application Support/MathLoop`.
- Makes frontend desktop asset path joining preserve macOS forward slashes and Windows backslashes.
- Adds Vitest and Rust tests that lock the cross-platform path behavior.
- Adds Mac-only npm scripts so the next agent can build unsigned/signed app bundles from macOS.

## Important Files

| File | Why it matters |
| --- | --- |
| `src-tauri/tauri.conf.json` | Base Tauri config. Still targets Windows `msi`. |
| `src-tauri/tauri.macos.conf.json` | macOS overlay. Tauri auto-merges it on macOS. Targets `app` and `dmg`. |
| `src-tauri/src/main.rs` | Rust backend. `mathloop_data_dir()` now resolves platform-specific data roots. |
| `src/services/desktopBridge.ts` | Frontend Tauri bridge. `buildDesktopAssetPath()` keeps OS-appropriate separators. |
| `src/services/desktopBridge.test.ts` | Vitest coverage for Windows/macOS desktop asset paths. |
| `src-tauri/icons/icon.icns` | macOS app icon generated from existing icon source via `npx tauri icon`. |
| `docs/macos-port/CHECKLIST.md` | Step-by-step Mac handoff checklist. |

## Data Directory Contract

The app now uses this convention:

| Platform | User data root |
| --- | --- |
| Windows | `%APPDATA%\MathLoop` |
| macOS | `~/Library/Application Support/MathLoop` |
| Linux/other Unix | `~/.mathloop` |

The SQLite database is always `mathloop.db` under that root. Book assets live under `books/{bookId}/`.

## Commands Already Verified on Windows

```powershell
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

The full Windows-side verification command is:

```powershell
npm run verify:port-prep
```

## Commands for the Next Agent on Mac

```bash
npm install
npm run verify:port-prep
npm run tauri:dev
npm run tauri:build:mac:unsigned
```

If unsigned build works, use Apple signing credentials and run:

```bash
npm run tauri:build:mac
```

The expected bundle outputs are under `src-tauri/target/release/bundle/macos/` for `.app` and `src-tauri/target/release/bundle/dmg/` for `.dmg`.

## Known Remaining Mac-Only Work

- Confirm `src-tauri/tauri.macos.conf.json` is auto-merged by Tauri on macOS.
- Open the app with `npm run tauri:dev` and verify images, answers, full-page scans, backup export/import, and tips saving.
- Build an unsigned `.app`/`.dmg` first.
- Configure Apple Developer signing identity and notarization credentials.
- Run signed build and verify Gatekeeper behavior on a clean macOS user account.
- Confirm migration behavior for existing Windows backups imported onto macOS.

## Notes for Signing and Notarization

Do not hard-code a personal Apple identity in `tauri.macos.conf.json`. Keep credentials in the local keychain or CI secrets. Tauri can use `bundle.macOS.signingIdentity`, `bundle.macOS.providerShortName`, and `bundle.macOS.entitlements` if the release process needs explicit values.

Reference: https://v2.tauri.app/reference/config/
