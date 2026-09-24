# STM32 手册知识库智能体 V2：证据驱动 RAG 与图文解析设计

## 1. 文档状态

- 日期：2026-09-22
- 状态：已获用户批准（含阅读器鼠标抓取拖动补充要求）
- 适用项目：`manual-lens`
- 核心原则：本地优先、证据可追溯、图文同等可检索、失败可解释、渐进迁移

## 2. 背景与问题

当前应用已经具备 Electron 桌面壳、SQLite 知识库、PDF/XLSX/图片导入、FTS5、可选向量检索、流式回答、页级引用和内置阅读器。现有基线通过 TypeScript 检查、33 个测试文件中的 62 项测试以及 Electron 端到端测试。

审计确认，现有架构仍有以下关键缺口：

1. 图片、扫描 PDF、PDF 内嵌位图和图表内容没有转换为可检索证据。图片只索引文件名；无文本层 PDF 可以显示，却不会产生文本块、来源或自动预览。
2. PDF 原生文本位置只保存在页面记录里，文本块没有精确范围；引用通常只能定位到整页，无法稳定高亮答案所在区域。
3. 中文全文查询大量使用单字、二元词的 `OR` 组合，容易被高频字噪声淹没；查询规划器还混入了针对 PA9、USART1、F103 等样例的硬编码事实。
4. 会话虽然持久化，但历史没有进入追问解析与检索，“它的复位值”“上面的寄存器”等问题会丢失指代。
5. 向量索引缺少完整的模型、维度、解析版本一致性约束，某些模型别名或升级场景会静默退回词法检索。
6. 模型未输出有效引用时，系统会把前几个召回结果追加为“参考资料”，这会把相关资料误呈现为已经支撑答案的引用。
7. 图片 MIME、复杂多栏阅读顺序、印刷页码识别和 UI 截图回归工具存在已确认缺陷。
8. UI 能打开来源，但还不是完整的“证据检查器”：缺少模态类型、OCR 置信度、页内坐标、检索轨迹和证据覆盖状态。

V2 的目标不是把应用扩张成通用 Agent 平台，而是把“STM32 手册问题必须能够回到原件验证”做深、做准。

## 3. 对标来源与取舍

设计借鉴以下高星开源项目的机制，但不复制其平台规模：

| 项目 | 借鉴机制 | 明确不引入 |
|---|---|---|
| RAGFlow | 手册型解析、布局/OCR/表格识别、分块可视化、检索测试、可追溯来源 | 搜索集群、对象存储、多租户和通用 Agent 平台 |
| Docling | 本地 PDF 布局、阅读顺序、表格、图片、坐标和 OCR；结构化文档输出 | 阻塞 UI 的同步解析和不受控的全量 VLM 调用 |
| PaddleOCR / RapidOCR | 中英文 OCR、ONNX 本地推理、扫描页和图片文字识别 | 单纯依靠 OCR 猜测图形连线或拓扑语义 |
| Haystack | 有类型、可替换、可观测的检索管线组件 | 任意 DAG 编辑器和 Python 框架直接嵌入 Renderer |
| AnythingLLM | 本地优先桌面体验、模型适配层、离线退化路径 | 多工作区、连接器市场和泛化 Agent 工具 |
| LlamaIndex | 核心模型与供应商集成解耦 | 云解析依赖和大量无关连接器 |

许可证策略：只直接集成许可证兼容且经过依赖清单审计的组件。GPL/AGPL 或带额外品牌条款的项目仅作产品和架构参考，不复制代码。正式 Windows 构建必须生成第三方许可证清单。

## 4. 目标与非目标

### 4.1 目标

- 让原生文本、OCR 文本、表格、独立图片、PDF 图像区域和 Excel 单元格都成为统一、可引用的证据。
- 对包含 STM32 标识符、寄存器、位域、引脚、数值和单位的问题实现高精度混合检索。
- 支持基于有限会话历史的追问理解，但所有技术结论仍需重新检索、重新引用。
- 每个关键结论可映射到一个或多个证据段；无足够证据时明确拒绝确认。
- 引用点击后打开正确文档、页或工作表，并尽可能高亮 bbox、单元格或图片区域。
- 导入、索引和回答管线可观测、可取消、可重试、可诊断。
- 保持 Windows 本地优先；没有聊天或向量 API 时仍可解析、搜索、查看证据。
- 平滑迁移现有知识库和会话，不破坏当前未提交的用户工作。

### 4.2 非目标

- 多用户、账号、RBAC、公有云服务或远程协作。
- 通用工作流画布、MCP 市场、网页爬虫和无人监督多智能体。
- 第一阶段引入独立 Qdrant、Elasticsearch、Milvus 等服务。
- 自动证明复杂电路拓扑。OCR 只能识别图中文字；拓扑解释需要可选视觉模型，并必须标记推断性质。
- 自动修改原始手册或把模型生成内容写回原件。

## 5. 总体架构

```text
Renderer
  ├─ Chat Workspace
  ├─ Library & Parse Jobs
  └─ Evidence Inspector / Reader
           │ typed IPC + stream events
Electron Main
  ├─ ImportOrchestrator
  │    ├─ BuiltInParser (PDF.js / XLSX)
  │    └─ EnhancedParserAdapter
  │          └─ local stdio sidecar: Docling + RapidOCR ONNX
  ├─ EvidenceRepository (SQLite)
  ├─ IndexCoordinator
  │    ├─ Entity index
  │    ├─ FTS5 / BM25
  │    └─ versioned in-memory vector index
  ├─ QueryOrchestrator
  │    ├─ ContextResolver
  │    ├─ SearchPlanner
  │    ├─ CandidateGenerators
  │    ├─ Fusion / Rerank / Expansion
  │    └─ EvidenceSelector
  └─ AnswerOrchestrator
       ├─ PromptContract
       ├─ streaming generation
       ├─ CitationVerifier
       └─ AnswerPacket
```

Renderer 不直接访问文件系统、数据库或 sidecar。所有本地解析和检索留在主进程或受控子进程中。sidecar 只通过标准输入输出交换有版本的 JSONL 消息，不监听网络端口。

## 6. 图文解析与导入

### 6.1 解析策略

提供三种内部策略，用户界面默认使用 `auto`：

- `native`：只用 PDF.js/XLSX，速度最快，适合纯文本资料。
- `enhanced`：运行 Docling 与 RapidOCR，提取布局、表格、图片区域和 OCR。
- `auto`：先做快速探测，再按页决定增强解析。默认判定规则属于有版本的 `parse-policy-v1`：原生非空白字符少于 80 个时执行整页 OCR；任一栅格图像对象覆盖页面面积至少 1% 时提取该图像区域并 OCR；矢量绘制操作不少于 150 个或矢量区域覆盖页面至少 10% 时，以固定 300 DPI 渲染该区域再 OCR；检测到规则表格候选时进入布局/表格解析。每次判定都保存命中的规则和数值。阈值只通过版本化策略与评估集调整，不能依赖文件名或“STM32 手册”这一身份猜测。

独立 PNG/JPG/JPEG 总是进入 OCR。Excel 先保留工作表、单元格地址、公式缓存值和合并范围，再把嵌入图片送到增强解析。纯矢量图即使存在周围原生文字，也必须先栅格化再做区域 OCR，避免漏掉轮廓字和图内标签。

### 6.2 本地 sidecar

- 技术：Python 固定版本、Docling、RapidOCR ONNX，默认语言为简体中文并保留英文/ASCII 标识符。
- 开发环境：项目专用虚拟环境，不污染系统 Python。
- Windows 发布目标固定为 x64 CPU。sidecar 是冻结的独立 Python 分发物，通过 Electron Builder `extraResources` 放在 ASAR 外；Electron 只从应用资源目录启动它。所有 EXE、DLL 和模型都有 SHA-256、签名状态与许可证清单，启动时执行依赖和模型自检。需要的 VC++ 运行库必须随安装器提供或在安装时明确检测，正式版运行时不联网下载模型。
- 增强解析组件安装后净增目标不超过 1.5 GiB。若阶段 1B 的实测包体超过上限，必须拆成由安装器选择的离线组件包；仍禁止应用在后台静默下载模型。
- 协议消息：`hello`、`parse`、`progress`、`page-result`、`complete`、`cancel`、`error`。每条 JSONL 都包含 `schemaVersion`、`jobId` 和 `requestId`；stdout 只输出协议消息，日志只写 stderr。
- 进程隔离：解析按可配置页批次执行。每个 `page-result` 先写入 `data/cache/parser-jobs/<jobId>`，检查点包含输入文件哈希、解析策略版本和页面范围。以同一 jobId 重启时跳过已提交批次。取消在页批次边界生效；超时后主进程终止 sidecar，并把未完成页标为可重试。
- 幂等性：相同输入哈希、revision、策略版本和页面范围只能提交一次；重复消息由主进程按 requestId 去重。
- 完整性：sidecar、模型、解析配置和输出 schema 均有版本与 SHA-256。

若 sidecar 缺失或失败，应用保留原生文本能力，并把文档标为“部分可检索”，不能静默显示为完整索引。

### 6.3 页面合并规则

每页先得到原生文本块、OCR 块、表格块和图片块。合并时执行：

1. 坐标重叠和规范化文本去重。
2. 原生文本优先，OCR 只补充原生层缺失的区域。
3. 表格保存结构化 Markdown/单元格以及用于搜索的行列文本。
4. 图片保存 bbox、OCR 标签、附近标题和上下文；可选视觉描述单独标记为 `vision_caption`，不得冒充手册原文。
5. 多栏页面按布局区域和阅读顺序输出，不再按相同 y 坐标简单拼接。
6. 印刷页码只从页眉/页脚候选与目录映射推断；无法确认时保存 `null`。

## 7. 证据数据模型

现有 `chunks` 不再承担所有语义。V2 新增统一证据层：

```ts
type EvidenceModality =
  | "native_text"
  | "ocr_text"
  | "table"
  | "figure"
  | "vision_caption"
  | "cell_range"

type NormalizedBbox = [x: number, y: number, width: number, height: number]

type EvidenceLocation =
  | {
      kind: "pdf_page"
      pageNumber: number
      bbox?: NormalizedBbox
      sourceRotation: 0 | 90 | 180 | 270
      transformVersion: 1
    }
  | {
      kind: "image"
      bbox?: NormalizedBbox
      transformVersion: 1
    }
  | {
      kind: "sheet"
      sheetName: string
      cellRange: string
    }

type EvidenceSegment = {
  id: string
  documentId: string
  revision: number
  printedPage?: string
  sectionId?: string
  modality: EvidenceModality
  text: string
  normalizedText: string
  location: EvidenceLocation
  assetId?: string
  ocrConfidence?: number
  parserId: string
  parserVersion: string
}
```

`NormalizedBbox` 统一使用未旋转原始页面或图片的左上角为原点，四个值均为相对宽高的 0–1 浮点数，顺序固定为 `[x, y, width, height]`。Renderer 根据 `sourceRotation` 和 `transformVersion` 映射到当前缩放/旋转后的视图。`ocrConfidence` 只对 OCR 结果有效，范围为 0–1；缺失表示不适用，不能把解析器的其他分数混入该字段。`cellRange` 只存在于 sheet location，bbox 只存在于 PDF 或图片 location。

SQLite V2 包含：

- `document_revisions`：解析配置、解析版本、覆盖率和状态。
- `sections`：章节层级、标题和页范围。
- `evidence_segments`：统一证据段与定位信息。
- `evidence_assets`：页面渲染、图片裁剪、表格和缩略图的相对路径及 MIME。
- `entities` 与 `segment_entities`：芯片型号、外设、寄存器、位域、引脚、函数和数值单位。
- `segment_embeddings`：`segment_id + model_key + dimensions + index_version` 的版本化向量。
- `retrieval_traces`：可选的本地诊断记录，不存 API Key 或完整敏感提示词。

`documents.active_revision` 决定普通检索读取的 revision；检索 SQL 必须显式连接 active revision，不能只按 documentId 查全部历史段。segment 与 revision 一经激活即不可变，重新解析创建新 revision。`evidence_assets` 保存在 `data/index/evidence-assets/<documentId>/<revision>/<assetId>`，记录输入哈希、MIME、尺寸和 revision 外键。

引用必须保存不可变的 `segmentId + revision`，不能只保存文档和页码。页、bbox、单元格范围和图片裁剪都由 segment 反查，避免引用数据在会话中漂移。旧 revision 只有在没有会话引用、存在已校验备份且用户执行明确清理时才允许回收。

## 8. 检索 harness

### 8.1 有类型的 SearchPlan

查询首先变成显式计划：

```ts
type SearchPlan = {
  resolvedQuestion: string
  intent: "fact" | "procedure" | "comparison" | "troubleshooting" | "visual"
  exactEntities: string[]
  lexicalQueries: string[]
  semanticQueries: string[]
  documentScope: string[] | "all"
  modalityFilter?: EvidenceModality[]
  requireExactIdentifierMatch: boolean
}
```

`ContextResolver` 最多读取最近四轮已完成消息，只用于消解指代和补全型号/外设上下文。它不把旧答案当作事实；解析后的问题仍需重新检索。离线时使用确定性实体和最近主题规则，配置聊天模型后可选择兼容的轻量改写，但改写失败不能阻断搜索。

删除现有针对具体问题答案的硬编码 planner。保留的是通用 STM32 词法知识：型号格式、寄存器/位域/引脚模式、外设别名和中英文同义词。

### 8.2 多路候选

1. **精确实体召回**：实体表、token 边界和规范化别名；`PA9` 不得匹配 `PA90`，`TIM1` 不得匹配 `TIM10`。
2. **FTS5/BM25**：标识符与关键实体使用必需或高权重子句；中文 n-gram 采用最小匹配比例，不再把所有单字无条件 `OR`。
3. **向量召回**：查询向量只搜索相同 `model_key`、维度和 `index_version` 的完整索引。
4. **模态召回**：含“图、框图、时序、引脚图、表格”等意图时提升 figure/table/OCR 段。

当前手册规模优先采用主进程中的版本化内存向量索引：启动后一次加载连续 Float32 数据，增量更新，避免每次查询从 SQLite 读取和反序列化全部 BLOB。20,000 个证据段以内使用精确余弦；超过配置阈值后再启用可插拔 HNSW，不在 V2 首批引入远程向量服务。

### 8.3 融合、重排与扩展

- 使用带来源权重的 RRF 融合实体、FTS 和向量排名。
- 精确型号、寄存器、位域、引脚和数值匹配是独立信号，不使用裸 `includes`。
- 轻量重排器考虑意图、章节标题、模态、文档版本、实体覆盖和重复度。
- 先选命中 segment，再按父章节、相邻段或表格行扩展上下文；引用仍指向原始命中段。
- 使用文档和页面多样性约束，防止一个重复页面占满全部来源。
- 低于证据门槛时返回“未定位到足够依据”，而不是用弱相关结果填满上下文。

每阶段记录候选数、耗时、分数和淘汰原因，开发者模式可以查看，但普通用户只看到简明状态。

## 9. 回答契约与引用校验

最终内部对象为：

```ts
type AnswerPacket = {
  markdown: string
  claims: Array<{
    text: string
    confidence: "high" | "medium" | "low"
    sourceTokens: string[]
    evidenceIds: string[]
    markdownRange: [start: number, end: number]
    verification: "mechanical" | "derived" | "unverified"
  }>
  evidence: EvidenceView[]
  warnings: string[]
  traceId?: string
}
```

回答生成规则：

1. 根据意图选择“结论—依据—步骤—注意事项”“参数表”“差异比较”或“排障检查”结构。
2. 生成前由服务端建立稳定短 token 映射，例如 `[S:01] -> immutable segmentId + revision`。每个关键技术结论在同一段内带来源 token；寄存器、位、地址、复位值、引脚、数值和单位保持证据原值。
3. 区分手册原文、由多条证据归纳的结论和模型推断。
4. 流完成后解析每个 claim 的 `sourceTokens`、`evidenceIds` 与 Markdown 字符范围。`CitationVerifier` 检查 token 映射是否存在，并检查结论中的技术标识符、十六进制值、数值和单位能否在指定证据中找到。
5. `mechanical` 仅表示引用存在且可机械核验的技术原子均出现在指定证据中，不表示系统已经证明整句语义正确。跨证据归纳必须标为 `derived` 并列出全部依据。映射或核验失败时只能标为 `unverified`，UI 不得显示“已验证”。
6. 模型没有引用时，召回结果只显示为“相关资料”，禁止自动伪装成答案引用。
7. 无聊天 API 时展示结构化检索报告和来源摘录，不生成技术结论。

为兼容不同 OpenAI 风格接口，流式传输仍以 Markdown 为主；流完成后解析和校验成 `AnswerPacket`。不强制所有供应商支持 JSON Schema。

## 10. 聊天与阅读界面

### 10.1 中间聊天区

- 输入框上方增加资料范围：`全部资料`、`当前手册`、用户选中的若干文档。
- 增加回答模式：`精确回答`、`解释原理`、`排障步骤`；默认根据问题自动判断。
- 答案按意图使用稳定结构，减少大段无层次文本。
- 行内引用显示模态徽标，例如“原文”“OCR”“表格”“图片”。
- 未验证结论和证据不足以不同视觉样式呈现，不与可靠引用混淆。

### 10.2 右侧证据检查器

右栏由单纯阅读器升级为三页签：

- `原件`：PDF、图片或工作表；定位页码、bbox 或单元格。
- `提取内容`：展示解析后的文本、表格、OCR 置信度和附近上下文。
- `证据详情`：显示文档版本、章节、解析器和为什么被选中。

点击行内 `[S#]` 或来源卡时：

1. 打开正确文档与 revision。
2. 跳转到正确 PDF 页、图片或工作表。
3. 有 bbox 时覆盖高亮；图片证据显示裁剪区域；Excel 高亮单元格范围。
4. 没有精确位置时明确显示“已定位到页，无法确定页内区域”。

首个高置信度核心证据仍可自动打开；低置信度或仅相关资料不会抢占用户当前阅读位置。

PDF 与图片视口支持鼠标抓取拖动。用户按住鼠标左键并拖动时，滚动容器同时更新横向与纵向位置；放大后可以查看超出当前视口的任意区域。交互规则固定如下：

- 使用 Pointer Events 和 pointer capture，共享同一个拖拽控制器；只响应主按钮。
- 移动至少 4 px 才进入拖动状态，普通点击不会被吞掉。
- 可拖动区域显示 `grab`，拖动期间显示 `grabbing`。
- PDF 从空白、Canvas 或文本层空白处开始拖动时平移；从实际文字 span 开始拖动时保留文字选择，不触发平移。
- 图片关闭浏览器原生图片拖拽，整个图片/空白视口都可抓取平移。
- 平移服从滚动容器边界；滚轮、触控板、滚动条、页码跳转和缩放继续可用。

### 10.3 知识库管理

每个文档显示：

- 原生文本、OCR、表格和图片覆盖率。
- 解析器版本、索引版本和最后成功时间。
- `完整可检索`、`部分可检索`、`需要增强解析`、`解析失败` 等真实状态。
- 后台任务进度、取消、重试和重新解析入口。

## 11. 迁移与兼容

数据库升级使用前向迁移，不修改历史迁移。升级开始前应用进入维护模式：允许只读浏览，拒绝新导入、索引写入和新会话写入，并向 Renderer 显示明确进度。

1. 使用 SQLite backup API 在同一磁盘的 `data/backups` 创建只读数据库备份，同时为数据库、设置和相关索引资产生成 SHA-256 清单；完成可读性与完整性检查后才继续。
2. 在一个 SQLite 事务中新建 V2 表、FTS、迁移映射和 `active_schema_revision` 元数据，不立即删除 `chunks` 和旧 `embeddings`。切换前失败直接回滚事务。
3. 先把现有 chunks 迁移为 `native_text` segments，保留原文档、页码和引用可用性。
4. 文档标记为 `parse_version=1`，退出维护模式后在后台逐本增强解析到 revision 2。
5. 每个文档的新 revision、资产、FTS 和向量先写入 revision 专属 staging 区。自检通过后，在单一事务中更新 `documents.active_revision`；切换失败继续使用旧 revision。
6. 旧会话引用若只有 chunkId，则通过不可变迁移映射到 segmentId；无法映射时仍能打开原页并标为“旧版页级引用”。
7. 应用异常退出时继续使用上一个完整 revision，绝不暴露半成品索引。解析资产只有在数据库 active pointer 提交后才可见。
8. 切换后的人工恢复通过知识库管理中的“恢复已校验备份”完成；恢复前再次备份当前状态。备份至少保留到所有文档 revision 2 验证完成并经过用户明确清理。

向量索引身份由 `provider + requested_model + returned_model + dimensions + schema_version` 组成。任一字段变化都要求新建索引；不能按行数相等就宣布完成。

实施开始前只读记录当前工作区状态。未经用户明确授权，不自动暂存、提交、回退或改写现有未提交文件；需要额外保护时，先生成可恢复的 `git diff --binary` 补丁并校验，或在用户授权后创建独立备份分支。只把与 V2 冲突的部分纳入明确迁移，不回退或覆盖用户已有成果。

## 12. 错误处理与隐私

- sidecar 不可用：退化为原生文本，文档显示部分覆盖并提供修复入口。
- 单页 OCR 失败：记录页级错误，继续处理其余页面；支持只重试失败页。
- 模型文件损坏：按校验和拒绝启动解析器，不能产生低质量静默结果。
- 向量不可用：继续使用实体和 FTS，并在诊断信息中说明实际使用的检索通道。
- 聊天中断：保留已生成内容和来源，但标记未完成，不把未校验段落持久化为可靠答案。
- 图片预览：始终保留真实 MIME；未知格式给出明确错误。
- 所有解析默认本地完成。远程聊天、embedding 和视觉能力按提供商分别启用；首次发送前必须展示会发送的数据类别：当前问题、被选择的有限历史、检索证据片段，或单页裁剪图。embedding 开启后会批量发送证据文本，这一影响必须单独说明。
- 默认不向远程接口发送本地文件路径、整本手册、非命中页面或未选择的图片。只有用户明确启用视觉 API 时，才允许发送命中的单页裁剪图。
- trace 默认关闭；启用后只记录哈希化文档标识、revision、检索通道、分数、候选数量、淘汰原因和耗时，默认保留 7 天，并提供一键清除。需要包含证据正文的诊断导出必须再次明确确认。
- 日志不记录 API Key、请求头、完整密钥设置、正文/OCR 原文、API 请求体或未经脱敏的用户路径；路径统一记录文档 ID 或哈希。

## 13. 性能与可观测性

- 解析运行在子进程，Electron 主线程不得因 OCR 或 PDF 分析持续阻塞。
- 所有长任务支持进度、取消和应用重启后的恢复。
- 检索基准使用 Windows x64、Ryzen 9 7940HX、32 GB RAM、NVMe SSD 的当前开发机作为首个固定参考配置；测试配置、CPU/RAM、语料哈希和提交号写入基准产物。
- 版本化命令 `npm run benchmark:retrieval -- --profile tests/benchmarks/retrieval-20k.json --runs 50` 使用 20,000 个 segment、固定维度向量、并发 1；一次预热后，本地候选生成与融合 P95 小于 800 ms，冷启动首查小于 2 s，不含远程 embedding 和回答生成。
- 阅读器在已加载文档中的引用跳转目标：P95 小于 500 ms。
- 向量、OCR 模型和页面图像使用有上限的 LRU 缓存。
- Trace 至少记录解析、实体、FTS、向量、融合、重排、上下文构建、首 token 和完成耗时。
- 普通用户只看到“正在解析/检索/生成/校验”；详细 trace 位于开发者开关中。

## 14. 测试与质量评估

### 14.1 固定语料

建立小型、可提交的测试 fixture。优先使用程序生成或明确允许再分发的素材；每个 fixture 都随附来源、许可证、生成脚本或授权说明，不能直接截取厂商手册中超出最小测试必要范围的内容：

- 原生文本 PDF，包含多栏、页码偏移和原生表格。
- 单页中英混合扫描 PDF，包含 `USART1_REMAP`、`GPIOA_CRL`、`PA9`。
- 正文文本加内嵌引脚图的 PDF。
- 纯矢量框图页。
- 扫描表格、PNG/JPG 引脚图。
- XLSX 单元格、合并单元格、公式和嵌入图片。
- 三个不可替代的视觉金标：唯一 token 分别只存在于独立 PNG、扫描 PDF 页面、PDF 内嵌图中；token 不得出现在文件名、PDF 原生文本、邻近正文或元数据。

同时为提供的 STM32 手册维护只存问题与真值定位的评估集，不复制大段受版权保护的原文。

### 14.2 指标

- 固定评估集至少包含 50 个问题，并按事实、步骤、比较、排障、图示分层；目标为 `Recall@5 >= 95%`、`MRR@10 >= 0.85`。每次报告同时给出预期文档命中率与预期页命中率，禁止只汇总平均值掩盖图示类别失败。
- 精确标识符负例：PA9/PA10、TIM1/TIM10、USART1/USART10 不得串匹配。
- STM32 标识符 OCR token recall 目标不低于 95%。
- 图片专有问题必须在无向量配置时仍能通过 FTS 命中正确图片或页面。
- 在同时禁用向量与聊天 API 时，查询视觉金标 token 必须返回 modality 为 `figure` 或 `ocr_text` 的正确 segmentId、原件和 bbox；相邻或前缀 token 不得误命中。
- 引用文档/页准确率在固定 fixture 上为 100%；有 bbox 的 fixture 必须高亮正确区域。
- 不受证据支持的数值或标识符不得显示为已验证 claim。
- 在 mock 聊天流下，视觉金标 token 对应的 AnswerPacket claim 必须引用同一个不可变 segmentId 与 revision。
- 模型别名、维度变化、部分 staging、sidecar 崩溃和应用重启均有集成测试。

### 14.3 自动化层级

- 单元测试：查询计划、实体边界、融合、引用解析、技术原子校验、迁移映射。
- 集成测试：sidecar 协议、OCR、PDF/图片/XLSX 导入、双缓冲索引和错误恢复。
- 检索评估：真值集自动输出指标和失败案例，不只断言单个示例。
- Renderer：回答结构、模态徽标、证据详情和各种空/错误状态。
- Electron E2E：扫描页问题、图片问题、多轮追问、自动打开引用、bbox 高亮、重启恢复。
- 阅读器交互：PDF 和图片放大到 150% 以上后，鼠标拖动必须改变 `scrollLeft` 与 `scrollTop`；从 PDF 文字 span 开始拖动不得启动平移。
- 维护工具：修复当前截图脚本对单一 Canvas 的假设，并把截图纳入视觉回归基线。

## 15. 分阶段交付

### 阶段 0：保护与基线

- 只读审阅现有未提交改动并记录状态；未经用户明确授权不得自动暂存或提交。若需要保护，按第 11 节生成并校验二进制补丁或申请备份分支授权。
- 固定当前测试、构建和安装基线。
- 建立检索真值集与性能测量工具。

### 阶段 1A：最短图像闭环

- V2 数据库迁移、EvidenceSegment、真实 MIME 和 revision。
- sidecar 最小协议、RapidOCR 本地解析、后台任务与取消。
- 独立 PNG/JPG 和扫描 PDF 进入 FTS。
- 引用可以打开独立图片或扫描页面，并按 bbox 高亮。
- PDF 与图片在放大后支持鼠标抓取横向和纵向平移，同时保留 PDF 文字选择。
- 通过第 14 节的 PNG 与扫描 PDF 视觉金标 E2E。

阶段 1A 完成定义：只存在于独立图片或扫描页中的 STM32 标识符，在禁用向量和聊天 API 时仍能检索到正确 segment、自动打开原件并高亮。

### 阶段 1B：复杂文档解析

- Docling 布局/阅读顺序/表格能力、完整协议检查点与 Windows x64 离线打包。
- PDF 内嵌图、矢量图区域、原生/扫描表格和 Excel 嵌图进入证据层。
- Excel 单元格定位、复杂 PDF bbox 变换、重启恢复和增强解析策略。
- 通过 PDF 内嵌图视觉金标、多栏与表格 fixture。

阶段 1B 完成定义：视觉证据不再依赖文件名或邻近正文，并且正式安装包可以在断网环境启动增强解析。

### 阶段 2：检索 harness

- SearchPlan、会话指代解析、实体索引、多路召回、RRF、重排和章节扩展。
- 版本化内存向量索引与一致性校验。
- 检索 trace 与真值集评估。

阶段 2 完成定义：固定评估集达到 `Recall@5 >= 95%`、`MRR@10 >= 0.85`，PA9/PA10 等负例不再互相提升。

### 阶段 3：回答契约与界面

- AnswerPacket、claim/citation 校验、稳定回答结构。
- 行内模态引用和右侧证据检查器。
- 范围、回答模式、文档覆盖状态与后台任务体验。

阶段 3 完成定义：关键结论都能回到对应证据；无法确认的内容不会伪装成已验证结论。

### 阶段 4：加固与发布

- 修复审计中的剩余 PDF、多栏、页码、截图脚本和错误提示问题。
- 全量测试、性能基准、Windows 安装、升级迁移、快捷方式和离线启动验证。
- 生成依赖许可证清单和解析模型清单。

## 16. 最终验收

只有同时满足以下条件，V2 才可标记完成：

1. 当前资料和会话可无损升级，失败时可回到上一完整数据库。
2. 原生文本、扫描页、独立图片和表格均能产生可解释来源。
3. 三个视觉金标 token 分别只存在于 PNG、扫描页和 PDF 内嵌图中；在禁用向量与聊天 API 时均返回正确 `figure|ocr_text` segmentId、原件和 bbox，高亮正确区域，且相邻/前缀 token 不误命中。mock 聊天回答中的对应 claim 引用同一 segmentId 与 revision。
4. 多轮追问能解析指代，但每轮技术答案仍重新检索并引用。
5. 不存在自动补全的假引用；未验证 claim 有明确状态。
6. 固定检索评估、单元、集成、Renderer、Electron E2E、构建和 Windows 打包全部通过。
7. 安装后的应用在无网络、无聊天 API、无向量 API 时仍能导入、OCR、全文搜索和查看证据。
8. 正式安装包含可校验的本地解析运行时、模型版本与第三方许可证清单。
9. PDF 与图片在放大后可用鼠标抓取拖动查看被裁出视口的区域；文字选择、滚轮和滚动条没有回归。

## 17. 参考实现快照

以下星数是 2026-09-22 的 GitHub API 快照，只用于说明调研覆盖面，实施依据以锁定版本、官方文档和许可证文件为准：

- [RAGFlow](https://github.com/infiniflow/ragflow)：91,146 stars，Apache-2.0。
- [Docling](https://github.com/docling-project/docling)：67,589 stars，MIT。
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)：89,985 stars，Apache-2.0。
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)：66,320 stars，MIT。
- [Haystack](https://github.com/deepset-ai/haystack)：26,578 stars，Apache-2.0。
- [LlamaIndex](https://github.com/run-llama/llama_index)：52,275 stars，MIT。

实际集成前必须重新核对目标 tag 的许可证、模型权重许可、Windows 二进制再分发条款与依赖树；仓库主页许可证不能代替模型资产审计。
