# VoyaVPN

VoyaVPN is a greenfield rewrite of v2rayN using Tauri 2, Rust, React,
TypeScript, Tailwind v4, and shadcn/ui foundations.

## Workspace

- `apps/desktop`: `@voya/desktop`, the Tauri desktop application.
- `apps/desktop/src-tauri`: Tauri shell, commands, tray, capabilities, and packaging.
- `apps/desktop/src`: React desktop frontend. Only `apps/desktop/src/ipc` may import `@tauri-apps/api`.
- `apps/web`: `@voya/web`, placeholder for a future web management surface.
- `apps/mobile`: `@voya/mobile`, placeholder for a future bare React Native app.
- `packages/ui`: source-only shadcn/ui primitives, design tokens, CSS, fonts, and `cn()`.
- `packages/i18n`: source-only i18next setup and locale JSON imported from v2rayN `.resx`.
- `packages/utils`: source-only shared formatting, redaction, mounted-ref, and error helpers.
- `crates/voya-core`: pure domain logic and golden-tested sing-box config generation.
- `crates/voya-db`: SQLite repositories and migrations.
- `crates/voya-platform`: OS-specific paths, process, proxy, TUN, and hotkey adapters.
- `crates/voya-net`: downloads, updates, subscriptions, Clash API, and ruleset clients.
- `crates/voya-udptest`: UDP tester support.
- `crates/voya-app`: application orchestration, including the product-level proxy runtime backed by the sing-box Clash-compatible API.

The root `package.json` `version` is the release-artifact version read by `scripts/release-artifacts.mjs`; keep app, Tauri, and Cargo versions aligned when intentionally bumping releases.

## Setup

Install the pinned frontend toolchain and dependencies:

```sh
corepack enable
corepack prepare pnpm@11.5.0 --activate
pnpm install --frozen-lockfile
```

## Development Commands

Run the full Tauri app in development:

```sh
pnpm dev
```

Run the frontend-only Vite dev server:

```sh
pnpm dev:web
pnpm --filter @voya/desktop dev:web
```

Regenerate Rust-to-TypeScript IPC bindings after command or event type changes:

```sh
pnpm bindings
pnpm bindings:check
```

## Build Commands

Build the frontend bundle:

```sh
pnpm build
pnpm --filter @voya/desktop build
```

Build unsigned debug Tauri packages without signing credentials:

```sh
pnpm tauri:build --debug
```

Build release-profile Tauri packages in a prepared signing environment:

```sh
pnpm tauri:build
```

## Test And Verification Commands

Run the complete local CI parity suite:

```sh
pnpm run verify:ci
```

Run the final gate checks individually:

```sh
pnpm run check:rust:test
pnpm run check:frontend:typecheck
pnpm run check:frontend:test
pnpm run check:frontend:lint
pnpm bindings:check
```

Run one desktop frontend test file:

```sh
pnpm --filter @voya/desktop test --run src/features/profiles/server-table.test.tsx
```

`pnpm run check:rust:test` runs workspace all-target tests while excluding the Tauri shell library harness, then builds the shell binary test target. The shell library target keeps its lib test harness disabled because shell-level coverage lives in workspace crates and frontend tests; this avoids Windows WebView/Wry loader failures from an otherwise empty harness. Do not use bare `cargo test --workspace --all-targets` on Windows, because Cargo still forces explicitly disabled targets when `--all-targets` is passed.

Linux CI installs Tauri build prerequisites before compiling the Rust workspace. Local Linux machines need the same Tauri system libraries.

## Release Commands

Run the credential-free release workflow equivalent locally:

```sh
pnpm run verify:ci
pnpm tauri:build --debug
node scripts/release-artifacts.mjs --input target/debug/bundle --output dist/release/local --target local-debug --channel beta --allow-empty
node scripts/release-updater-metadata.mjs --input dist/release --out dist/updater/latest.json --target darwin-aarch64,darwin-x86_64,linux-aarch64,linux-x86_64,windows-aarch64,windows-x86_64 --placeholder-signatures
```

The GitHub release workflow is manual-only:

```text
.github/workflows/release.yml
workflow_dispatch inputs: channel, build_profile, dry_run, updater_metadata
```

Generate release-owner evidence scaffolding and validate staged metadata:

```sh
pnpm release:record
pnpm release:verify-staging -- --release-index <release-index.json> --updater-metadata <latest.json> --core-manifest <core-assets.json>
```

Production stable publication still requires external signing identities, notarization credentials, updater private keys, CDN publication control, diagnostics approval, platform smoke machines, and rollback readiness. The release runbooks live under `docs/release/`, and the stable gate report is `docs/verification/stable-release-gate.md`.
