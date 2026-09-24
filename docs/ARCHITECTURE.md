# 架构说明

## 进程模型

```
┌──────────────────────────── Electron 主进程 ────────────────────────────┐
│  src/main/index.ts      窗口、菜单、主题、资料库位置解析                  │
│  src/main/ipc/          IPC 白名单注册（唯一的渲染进程入口）              │
│  src/main/services/     AppServices：装配数据库、导入、检索、聊天         │
│  src/main/storage/      SQLite 表结构与数据访问                          │
│  src/main/ingestion/    PDF / XLSX / 图片提取、分块、分词                │
│  src/main/search/       关键词检索、领域词表、目录索引、RRF、重排、向量    │
│  src/main/chat/         会话存储、提示词构建、引用解析                    │
│  src/main/api/          OpenAI 兼容客户端、流式解析、密钥脱敏             │
└─────────────────────────────────────────────────────────────────────────┘
                                  ▲
                    contextBridge（白名单 API，无 Node 能力）
                                  ▼
┌──────────────────────────── 渲染进程 ──────────────────────────────────┐
│  src/renderer/src/state/app-store.ts   Zustand 单一状态源                │
│  src/renderer/src/components/          会话、问答、设置、资料库、阅读器   │
│  src/renderer/src/lib/                 布局、PDF 定位、输入框高度纯函数   │
└─────────────────────────────────────────────────────────────────────────┘
```

渲染进程不直接访问文件系统与数据库，所有能力都通过 `src/preload/api.ts` 暴露的白名单方法，
经 `src/main/ipc/register-handlers.ts` 路由到 `AppServices`。

## 数据模型

SQLite 文件位于 `<资料库>/index/knowledge.db`。

| 表 | 作用 |
|---|---|
| `documents` | 资料元数据：标题、原始文件名、类型、页数、SHA-256、状态 |
| `pages` | 每页正文、印刷页码、页面宽高、文本坐标 JSON |
| `toc_nodes` | 目录树：标题、层级、页码、父子关系 |
| `chunks` | 页级文本块（700 字，120 字重叠），含 `search_tokens` 与标题 |
| `chunks_fts` | FTS5 外部内容索引（`unicode61` 分词器 + 预分词 token） |
| `embeddings` / `embedding_build` | 可选向量索引与重建暂存 |
| `conversations` / `messages` | 会话与消息（含引用 JSON） |
| `import_jobs` | 导入任务进度与错误 |
| `schema_meta` | 结构与索引版本标记 |

`chunks_fts` 使用 `content='chunks'` 外部内容模式，并由触发器保持同步，
因此重建索引只需要更新 `chunks.search_tokens`，不必重新解析 PDF。

## 资料库位置

`src/main/config/data-location.ts` 负责：

- `readDataRootPointerSync()`：读取 `%APPDATA%/com.local.stm32rag/data-location.json`。
- `dataRootFromSelection()`：把用户选择的父目录拼成 `<父目录>/STM32RAG知识库`。
- `migrateDataRoot()`：校验路径关系 → 复制目录（排除 `app-state`）→ 原子写入指针文件。

默认值在 `src/main/index.ts` 中由 `app.getPath("documents")` 计算，**源码中不存在任何机器相关绝对路径**。

## 导入流程

```
importPaths()
  → hashFile()                 计算 SHA-256 去重
  → copyFile()                 复制到 <资料库>/library/<uuid>.<ext>
  → extractDocument()          PDF / XLSX / 图片分支提取
  → chunkPages()               按页分块，附带该页所属章节标题
  → tokenizeForSearch()        中文 bigram + 英文标识符
  → transaction()              写入 pages / chunks / toc_nodes，更新 documents
```

任一环节失败会回滚数据库记录并删除已复制的文件，避免留下半成品。

## 启动时自愈

`ensureSearchIndex()`（`src/main/search/search-index.ts`）在应用启动、数据库打开后运行：

1. 读取 `schema_meta.search_index_version`。
2. 版本落后时，用当前分词器重算所有 `chunks.search_tokens`，
   并用「页码最接近且层级最深」的规则重算 `chunks.heading`。
3. 写回版本号。

这样老版本建立的索引无需重新导入手册即可获得新的检索质量。实测 4162 个文本块约 1.9 秒。

## 阅读器定位

`src/renderer/src/components/reader/PdfPage.tsx` 把 PDF 渲染成等高页槽（`pageHeight + 16px` 间隙）：

- `IntersectionObserver` 负责虚拟化渲染与上报当前页。
- 只有导航（目录/上下页/页码输入）才会触发跳页；由滚动自身上报的页码变化会被忽略。
- 改变阅读器宽度时，页槽高度按比例变化，滚动偏移用 `rescaleScrollTop()` 同步缩放，
  从而保持「同一页、同一页内位置」。

## 主题

`src/renderer/src/styles.css` 使用语义化 CSS 变量：

`--surface` / `--text` / `--line` / `--accent` / `--radius-*` / `--shadow-*`

三套主题（`obsidian` / `blue` / `white`）只覆盖变量，组件不感知主题。
主进程通过 `nativeTheme.themeSource` 让原生标题栏与主题保持一致。

## 密钥

`src/main/security/secret-store.ts` 使用 Electron `safeStorage`（Windows 下为 DPAPI）。
密文写入 `<资料库>/secret.bin`，明文只在主进程内存中短暂存在。
`src/main/api/key-redaction.ts` 保证错误信息与日志中不会出现完整密钥。
