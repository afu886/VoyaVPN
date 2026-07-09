# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VoyaVPN is a greenfield rewrite of v2rayN using Tauri 2 (Rust backend) + React 19 / TypeScript / Tailwind v4 / shadcn/ui (frontend). It generates **sing-box** proxy configs and supervises the core process. There is no v2rayN data migration path — the schema and IPC DTOs are a fresh design, and obsolete v2rayN profile fields (`HeaderType`, `RequestHost`, `Path`, `Extra`, `Ports`, `AlterId`, `Flow`, `Id`, `Security`) must never be introduced.

The package manager is **pnpm 11.5.0** (pinned via Corepack). Rust toolchain is 1.96.0 in CI (workspace MSRV 1.82).

## Monorepo Layout

- `apps/desktop/` — `@voya/desktop`, the Tauri desktop app. It owns `apps/desktop/src`, `apps/desktop/src-tauri`, `apps/desktop/public`, `apps/desktop/e2e`, Vite, Playwright, shadcn, and desktop tsconfigs.
- `apps/web/` — `@voya/web`, placeholder for a future web management surface. Do not copy desktop IPC here; the current backend surface is Tauri IPC only.
- `apps/mobile/` — `@voya/mobile`, placeholder for a future bare React Native app. It does not consume `@voya/ui`, which is DOM/Radix-specific.
- `packages/ui/` — `@voya/ui`, source-only shadcn primitives, design tokens, shared CSS, fonts, and `cn()`.
- `packages/i18n/` — `@voya/i18n`, source-only i18next setup and imported locale JSON.
- `packages/utils/` — `@voya/utils`, source-only shared formatting/redaction/error helpers.
- `crates/`, `tests/`, `docs/`, and `scripts/` remain rooted at the workspace.

Package scope is always `@voya/*`. The `@/*` alias is desktop-private and resolves to `apps/desktop/src`; shared imports use `@voya/*`.

Version authority: the root `package.json` `version` is the release-artifact version read by `scripts/release-artifacts.mjs`. Keep root, desktop package, Tauri config, and Cargo package versions aligned when doing an intentional version bump.

## Commands

```sh
pnpm dev                 # Run full Tauri app (backend + frontend) in dev
pnpm dev:web             # Delegates to @voya/desktop frontend-only Vite dev server (127.0.0.1:1420)
pnpm build               # Delegates to @voya/desktop build (tsc -b + vite build)
pnpm --filter @voya/desktop build  # Build only the desktop app
pnpm tauri:build --debug # Unsigned debug Tauri packages (no signing creds needed)

pnpm run verify:ci       # Full local CI-parity suite — run this before declaring work done

# Individual gates (mirror CI jobs):
pnpm run check:rust:test # Workspace tests (see note below) + shell binary test target
pnpm run check:frontend:typecheck  # pnpm -r run typecheck
pnpm run check:frontend:test       # Vitest once across configured projects
pnpm --filter @voya/desktop test --run src/features/profiles/server-table.test.tsx  # Single desktop test file
pnpm run check:frontend:lint       # ESLint
pnpm run check:rust:fmt  # cargo fmt --all --check
pnpm run check:rust:clippy   # clippy --workspace --all-targets -D warnings
pnpm bindings:check      # Fail if generated IPC bindings drift (see IPC below)
pnpm i18n:check          # Fail if locale files drift from v2rayN .resx source
```

Single Rust test: `cargo test -p voya-core <test_name>` (substitute the owning crate).

**Do not run bare `cargo test --workspace --all-targets`.** Use `pnpm run check:rust:test` (→ `scripts/check-rust-test.mjs`). It runs workspace all-target tests while excluding the Tauri shell lib harness (whose lib test harness is intentionally disabled to avoid Windows WebView/Wry loader failures), then builds the shell binary test target separately. `--all-targets` forces explicitly-disabled targets, breaking Windows.

## Architecture

A Rust workspace of layered crates plus the Tauri desktop shell, React app, and source-only frontend packages. The dependency direction flows: `voya-core` (no deps on others) → `voya-app` (orchestration) → `apps/desktop/src-tauri` (shell) → `apps/desktop/src` (frontend, via generated IPC). Shared frontend code flows through `packages/*` and must not depend on desktop-private IPC.

### Rust crates (`crates/`)

- **voya-core** — Pure, OS-free, deterministic domain logic. Owns models/enums, share-link parsers, routing/DNS logic, and **sing-box config generation** (`coregen` modules: `config.rs`, `context.rs`, `singbox.rs`, `groups.rs`). Must contain **no** `#[cfg(target_os)]`, OS/Tauri/filesystem/network/process APIs. Clocks, randomness, ports, and platform facts are *injected*.
- **voya-db** — Fresh sqlx SQLite schema, migrations, repositories. The **only** typed-blob persistence boundary (`ProtocolExtraItem`/`TransportExtraItem` serialize to TEXT only here).
- **voya-platform** — All OS-specific code: `paths`, `process`, `elevation`, `tun`, `sysproxy`/PAC, `autostart`, `hotkeys`, `coreinfo`, `privilege`. Domain crates reach platform side effects through traits/adapters defined here.
- **voya-net** — HTTP downloads, subscriptions, update checks, Clash REST/WebSocket, WebDAV, rulesets.
- **voya-udptest** — SOCKS5 UDP-associate channel and UDP test modes.
- **voya-app** — Orchestration layer. Managers (one module per subsystem: `runtime`, `supervisor`, `profiles`, `subscriptions`, `routing`, `dns`, `clash`, `statistics`, `sysproxy`, `tun`, `elevation`, `updates`, `backup`, etc.) that combine the domain/db/net/platform crates. No Tauri wiring here.
- **apps/desktop/src-tauri** — Tauri bootstrap and the *only* backend place that knows about Tauri APIs: command/event registration, `AppState` injection, tray, capabilities, plugins, packaging, lifecycle. `src/lib.rs` `run()` wires everything in `setup()`; IPC lives in `apps/desktop/src-tauri/src/ipc/` (`commands.rs` has ~186 commands, `events.rs`).

### Frontend (`apps/desktop/src/` + `packages/`)

- **`apps/desktop/src/ipc/` is the only frontend directory allowed to import `@tauri-apps/api` or Tauri plugins.** Features call typed wrappers (`commands.ts`, `updater.ts`, `process.ts`) and use the single mounted `event-bridge.tsx`, never raw `invoke`/`listen`. This is an architectural rule (ADR 0002) and is lint-enforced.
- **`apps/desktop/src/ipc/bindings.ts` is generated** from Rust `specta`/`tauri-specta` — never edit by hand, never hand-write DTOs mirroring backend types. It is regenerated automatically on every debug build (`run()` exports it). After changing any Rust command/event/DTO, run `pnpm bindings` and commit; `pnpm bindings:check` (a CI gate) fails on drift.
- `apps/desktop/src/features/<subsystem>/` — desktop feature UIs (profiles, subscriptions, routing, dns, clash, groups, backup, options, logs, qr, templates, updates, home).
- `packages/ui/src/components/` — shared shadcn/ui primitives; `apps/desktop/src/components/app-shell/` — desktop shell. State via Zustand (`apps/desktop/src/stores/`) + TanStack Query.
- `packages/i18n/src/locales/` — generated locale JSON imported from upstream v2rayN `.resx` files.

### IPC event model (three channels)

1. **Invalidation events** — backend changes that invalidate TanStack Query caches (profiles, subscriptions, routing, DNS, settings, Clash).
2. **Transient streams** — live state outside cached queries (log lines, statistics, core state, speedtest, sysproxy/TUN changes). See `TransientStreamEvent` in `events.rs`.
3. **Imperative app events** — shell actions (reload, show/hide, add-via-scan/clipboard, shutdown, set-default-server, etc.).

Command-boundary errors are converted into a typed `AppError` union exposed to TypeScript; crate-internal errors may use local enums.

## Config generation parity (highest-risk area)

Config generation correctness is judged by the **generated sing-box JSON**, not entity snapshots. Golden testing is the parity contract:

- Golden fixtures live in `tests/golden/` (`singbox/`, `groups/`, driven by `matrix.json`); `voya-core` canonicalizes JSON and diffs against this corpus.
- Fixtures must cover policy-group ordering, proxy chains, DNS final/direct detection, TUN, pre-socks, templates, and per-rule outbounds.
- Where the `sing-box` binary exists, generated configs must pass `sing-box check -c`; when absent, acceptance is skipped with explicit evidence but JSON golden parity still runs.
- Raw JSON is allowed only at defined template/raw-config boundaries — normal profile/DNS/routing/transport/protocol data must be typed.

## Cores and i18n

- The sing-box core binary is **not redistributed by default** (GPL/AGPL). It is fetched on first run: `postinstall` runs `scripts/install-sing-box-core.mjs` (force re-fetch with `pnpm core:sing-box:install`).
- Locale files (`packages/i18n/src/locales/*.json`) are **imported from v2rayN `.resx` files**, not edited directly. Source dir defaults to `../v2rayN/v2rayN/ServiceLib/Resx` (override with `VOYAVPN_V2RAYN_RESX_DIR`). Run `pnpm i18n:import` to regenerate; `pnpm i18n:check` is a CI gate. `de` is a Voya-managed English fallback (no upstream German resx).

## macOS NetworkExtension hygiene

macOS chooses PacketTunnel providers globally by bundle id through PlugInKit,
not by the currently launched VoyaVPN app path. Any copied or launched `.app`
that contains `Contents/PlugIns/app.voyavpn.desktop.PacketTunnel.appex` can
become the elected provider for `app.voyavpn.desktop.PacketTunnel`.

- After copying, launching, or testing any `.app` with the PacketTunnel appex,
  quit VoyaVPN and run `pnpm native:macos:ne:doctor --fix` (add `--app <path>`
  for a non-`/Applications` bundle and `--dev` for the repo release bundle).
- `pnpm build:mac:local` installs the built app into `/Applications`, strips
  `Contents/PlugIns` from the leftover `target/` copies, and runs the doctor
  itself; see `docs/release/macos-local-tun-testing.md`.
- Fixtures that do not test NetworkExtension behavior must remove
  `Contents/PlugIns` before launching the app.
- Entitlement/provisioning fixtures may keep the production extension id, but
  cleanup is mandatory before deleting the fixture directories.
- Do not add `pnpm native:macos:ne:doctor --fix` to CI or broad verification
  scripts; it intentionally mutates machine-global PlugInKit state.

## Conventions

- Clippy is strict: `unwrap_used`, `dbg_macro`, `todo`, and `all` are warnings, and CI runs clippy with `-D warnings` — avoid `.unwrap()`/`.expect()` outside tests and setup.
- ADRs in `docs/adr/` (0001 architecture, 0002 typed IPC, 0003 config parity, 0004 platform boundaries) are the authoritative design record — consult them before changing crate boundaries or the IPC contract.
- Commit messages in this repo are written in Chinese with `type:` prefixes (feat/fix/refactor/chore/docs); multiple changes are often combined in one message.
- E2E smoke tests use Playwright + `tauri-driver` (`apps/desktop/e2e/`, `pnpm smoke:frontend`). Release tooling and runbooks live in `scripts/release-*.mjs` and `docs/release/`.
