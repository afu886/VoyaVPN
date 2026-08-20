# @voya/i18n

`src/locales/*.json` 由 `pnpm generate:i18n` 生成，禁止手改。生成器通过 TypeScript AST 收集非测试生产源码实际使用的 key，再合并并裁剪两类来源：

- `src/overlays/*.json`：Voya 自有界面文案，是应用文案的唯一编辑入口；8 个语言文件必须保持 key 对齐。
- v2rayN `ResUI*.resx`：仅把实际引用项导入生成文件的 `resx` 命名空间。

上游 ResX 目录不可用时，生成器使用 `src/locales/*.json` 中已签入的引用快照。`pnpm check:i18n` 会拒绝无效 key、动态模板 key、语言集合漂移和孤儿翻译；`useI18n().t` 只接受生成的 `TranslationKey`。

`de` 是 Voya 自管的英文回退语言，不对应上游德语 `.resx`。
