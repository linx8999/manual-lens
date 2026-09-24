# 贡献指南

感谢参与改进。本项目最需要帮助的方向：

1. 中文 / 英文关键词抽取与领域词表扩充。
2. 检索排序策略（更多可复现的评测题与失败样例）。
3. 阅读器体验（大文档性能、标注、跳转）。
4. 跨平台打包与安装验证。

## 开发流程

```powershell
git clone <your-fork>
cd stm32-manual-agent
npm install
npm run dev
```

提交前请确保：

```powershell
npm run typecheck
npm test
```

## 绝对不能提交的内容

- 任何 STM32 / 厂商手册、数据手册、截图（版权资料）。
- 任何 API Key、Token、账号、内网地址。
- 任何个人目录与机器路径（例如 `C:\Users\<你的名字>\...`）。
- `data/`、`resources/library/`、`resources/library-manifest.local.json`、`artifacts/`。

这些路径已在 `.gitignore` 中排除。提交前自查：

```powershell
git status --short
rg -n "sk-[A-Za-z0-9]{16,}" .
rg -n "C:\\\\Users\\\\" .
```

## 代码规范

- TypeScript 严格模式，不用 `any` 绕过类型。
- 主进程与渲染进程之间只通过 `src/shared` 的类型与 `preload` 白名单通信。
- 纯逻辑抽到 `src/main/search`、`src/renderer/src/lib` 等可单测的位置。
- 中文注释只在解释「为什么」时使用，避免复述代码。
- UI 文案使用简体中文，保持与现有界面一致。

## 测试要求

- 修 Bug：先补一个会失败的测试，再修复。
- 改检索：必须跑 `npx tsx scripts/smoke-retrieval.ts`，并在 PR 中给出前后命中率。
- 改解析：必须跑 `npx tsx scripts/check-extraction.ts`，页面覆盖率不得低于 95%。
- 涉及手册的测试在没有语料时应自动跳过，不要写成硬依赖。

## Pull Request 检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] 没有提交任何手册、密钥或个人路径
- [ ] 检索相关改动附带了基准测试结果
- [ ] 用户可见的行为变化已更新 README 或 `docs/`

## 提交信息

使用 Conventional Commits 风格，例如：

```
feat(retrieval): weight section titles from the manual outline
fix(reader): keep the visible page while resizing the pane
docs: document how to import a private manual corpus
```
