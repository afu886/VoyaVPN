# @voya/i18n

`src/locales/*.json` 由 `pnpm i18n:import` 生成，禁止手改。生成器会把两类来源合并：

- `src/overlays/*.json`：Voya 自有界面文案，是应用文案的唯一编辑入口；8 个语言文件必须保持 key 对齐。
- v2rayN `ResUI*.resx`：导入到生成文件的 `resx` 命名空间。

上游 ResX 目录不可用时，导入器会保留 `src/locales/*.json` 中已签入的 `resx` 快照，同时继续生成或校验 Voya overlay。因此新增或修改 Voya 文案不依赖本机存在 v2rayN 仓库。

`de` 是 Voya 自管的英文回退语言，不对应上游德语 `.resx`。
