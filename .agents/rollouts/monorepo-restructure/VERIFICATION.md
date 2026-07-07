# monorepo-restructure 终验证据

- Batch: `06-01-full-verify`
- Phase: `06-verification`
- 验证时间: `2026-07-07 22:45:22 CST`
- 验证基线 HEAD: `63620c6`

## 全量 gate

命令: `pnpm run verify:ci`

结果: 通过。`scripts/verify-ci.mjs` 顺序执行的 8 个 gate 全部绿色，最终输出 `CI baseline checks passed.`

| Gate | 命令 | 结果摘要 |
| --- | --- | --- |
| Rust formatting | `pnpm run check:rust:fmt` | 通过；`cargo fmt --all --check` 无 diff。 |
| Rust Clippy | `pnpm run check:rust:clippy` | 通过；`cargo clippy --workspace --all-targets -- -D warnings` 完成。 |
| Rust tests | `pnpm run check:rust:test` | 通过；workspace 测试 338 个通过，shell binary 测试 3 个通过。 |
| Frontend typecheck | `pnpm run check:frontend:typecheck` | 通过；`pnpm -r run typecheck` 覆盖 `packages/{utils,i18n,ui}` 与 `apps/desktop`。 |
| Frontend tests | `pnpm run check:frontend:test` | 通过；`pnpm test --run` 摘要为 27 个测试文件、159 个测试通过。 |
| Frontend lint | `pnpm run check:frontend:lint` | 通过；`eslint .` 无报错。 |
| Generated binding drift | `pnpm run check:bindings` | 通过；输出 `Generated IPC bindings are up to date.` |
| i18n locale drift | `pnpm run i18n:check` | 通过；本机缺少 `../v2rayN` ResX 资源，脚本按预期跳过导入。 |

## Vitest 收集核对

命令:

- `pnpm test --run`
- `pnpm test --run --reporter=json --outputFile=/tmp/voyavpn-vitest-results.json`

结果:

- CLI 摘要: 27 个测试文件、159 个测试通过。
- JSON `testResults` 唯一路径统计: 27 个测试文件。
- 扩展名分布: `tsx` 14 个、`ts` 6 个、`mjs` 7 个。
- 已确认包含 7 个 `scripts/*.test.mjs`:

```text
scripts/check-release-readiness.test.mjs
scripts/release-artifacts.test.mjs
scripts/release-record.test.mjs
scripts/release-updater-metadata.test.mjs
scripts/sing-box-core-installer.test.mjs
scripts/tauri-core-seeds.test.mjs
scripts/verify-release-staging.test.mjs
```

## 旧路径残留扫描

命令:

- `grep -rn 'repoRoot, "src' scripts/`
- `grep -rn 'repoRoot, "src-tauri' scripts/`

结果:

- 两条命令均无输出，退出码均为 1，表示零命中。
- `scripts/` 内未发现 `repoRoot` 直拼旧 `src` / `src-tauri` 路径模式。
- 本 batch 无需修复残留旧路径。

备注: `apps/desktop/src-tauri/src/` 内部的 `../src/ipc/bindings.ts` 是兄弟目录相对路径契约，属于预期合法路径，不纳入旧路径残留。

## git 历史追踪抽查

命令:

- `git log --follow --oneline -- apps/desktop/src-tauri/src/lib.rs | head -n 20`
- `git log --follow --oneline -- packages/ui/src/components/button.tsx | head -n 20`

结论:

- `apps/desktop/src-tauri/src/lib.rs` 可穿过迁移提交 `378bf08 chore: 迁移桌面应用到 apps/desktop`，继续追踪到迁移前历史，最早可见 `d668778 init`。
- `packages/ui/src/components/button.tsx` 可穿过提炼提交 `7fd1422 refactor: 提炼 ui 公共包` 与迁移提交 `378bf08 chore: 迁移桌面应用到 apps/desktop`，继续追踪到迁移前历史，最早可见 `d668778 init`。

## 人工冒烟清单

以下项目按 batch 规则只列清单，本次未执行:

- `pnpm dev`: 验证 Tauri 窗口启动，debug 构建自动重导 bindings 后确认 `apps/desktop/src/ipc/bindings.ts` 无漂移。
- `pnpm tauri:build --debug`: 开包检查 `THIRD_PARTY_NOTICES.md` 与 `core-seeds`。
- `pnpm smoke:frontend`: Playwright + `tauri-driver` 冒烟。
- `release.yml` dry-run: 手动触发 `channel=beta`、`dry_run=true` 验证发布链路。

## 终验结论

- `pnpm run verify:ci` 已通过。
- 旧路径残留扫描零命中，无待修复项。
- `git log --follow` 抽查确认迁移文件历史可追踪。
- `VERIFICATION.md` 已落库，作为 `monorepo-restructure` 迁移完成证据。
