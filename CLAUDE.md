# MathLoop Project CLAUDE.md

This file guides Claude Code on how to build, run, and complete the macOS migration for MathLoop.

## Project Context
MathLoop is a Tauri v2 + React 19 + TypeScript + Rust + SQLite desktop application. It has been prepared on Windows for macOS porting.
- **Current Branch**: `codex/macos-port-prep`
- **User Data Path (macOS)**: `~/Library/Application Support/MathLoop`

## Your Task on macOS
Please help the user complete the macOS migration checklist.
1. Read the **Migration Guide** at [docs/macos-port/MIGRATION-GUIDE.md](file:///docs/macos-port/MIGRATION-GUIDE.md) and [docs/macos-port/HANDOFF.md](file:///docs/macos-port/HANDOFF.md) for full context.
2. Use the **Checklist** at [docs/macos-port/CHECKLIST.md](file:///docs/macos-port/CHECKLIST.md) to verify the build, run the smoke tests, and create unsigned/signed macOS packages.
3. Check and resolve any remaining Mac-specific issues listed in the checklist or guide.

## Build and Test Commands
- **Install Dependencies**: `npm install`
- **Web Dev Mode**: `npm run dev`
- **Tauri Desktop Dev**: `npm run tauri:dev`
- **Run TypeScript Compiler**: `npx tsc --noEmit`
- **Run Frontend Tests**: `npm test`
- **Run Rust backend Tests**: `npm run test:rust` (or `cargo test --manifest-path src-tauri/Cargo.toml`)
- **Full Verification**: `npm run verify:port-prep` (runs frontend tests, frontend build, and rust tests)
- **Build Unsigned Package (.app, .dmg)**: `npm run tauri:build:mac:unsigned`
- **Build Signed Package**: `npm run tauri:build:mac`
- **Inspect Tauri Info**: `npx tauri info`
