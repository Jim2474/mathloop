# macOS Port Checklist

Use this checklist from a real macOS machine.

## 1. Environment

- [ ] Install Node.js 24.x or another project-compatible Node version.
- [ ] Install Rust stable with `rustup`.
- [ ] Install Xcode Command Line Tools: `xcode-select --install`.
- [ ] Clone or sync the `codex/macos-port-prep` branch.
- [ ] Run `npm install`.
- [ ] Run `npx tauri info` and save notable warnings in this file or the PR notes.

## 2. Baseline Verification

- [ ] Run `npm test`.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] Run `npm run build`.
- [ ] Run `npm run verify:port-prep`.

Expected result: all tests pass, Vite build completes, and Rust tests include the three data-directory tests.

## 3. Runtime Smoke Test

- [ ] Run `npm run tauri:dev`.
- [ ] Confirm the app creates `~/Library/Application Support/MathLoop/mathloop.db`.
- [ ] Confirm bundled books appear in the navbar.
- [ ] Open at least one question from each bundled book.
- [ ] Confirm question images, answer images, and full-page scans render.
- [ ] Mark a mistake, rate it, quit the app, reopen, and confirm the review state persists.
- [ ] Edit and save a tip, then confirm the relevant `questions.json` changes under the macOS data directory.
- [ ] Export and import a backup from the Backup page.

## 4. Unsigned Build

- [ ] Run `npm run tauri:build:mac:unsigned`.
- [ ] Confirm a `.app` exists in `src-tauri/target/release/bundle/macos/`.
- [ ] Confirm a `.dmg` exists in `src-tauri/target/release/bundle/dmg/`.
- [ ] Drag-install from the `.dmg` and launch locally.

## 5. Signed Release Build

- [ ] Confirm Apple Developer account and Developer ID Application certificate are available.
- [ ] Decide whether to set signing through local keychain auto-detection, `APPLE_CERTIFICATE` secrets, or explicit `bundle.macOS.signingIdentity`.
- [ ] Add an entitlements file only if macOS runtime testing proves one is needed.
- [ ] Run `npm run tauri:build:mac`.
- [ ] Notarize and staple the `.dmg`.
- [ ] Test the signed `.dmg` on a clean macOS account.

## 6. Release Notes

- [ ] Document the macOS data path: `~/Library/Application Support/MathLoop`.
- [ ] Document backup migration from Windows export to macOS import.
- [ ] Capture the final Tauri, Rust, Node, and macOS versions used for release.
