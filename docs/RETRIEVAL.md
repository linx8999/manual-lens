# 检索管线说明

目标：用户用日常中文提问，也能准确定位到手册里的具体页。

## 1. 为什么中文需要专用分词

SQLite FTS5 的 `unicode61` 分词器会把连续汉字当成**一个** token，
所以必须先自行切分再写入 `chunks.search_tokens`。

早期实现同时写入单字与双字词，结果单字（低、功、模、式）在几乎每个文本块里都出现，
BM25 的 IDF 被拉平，排序基本失效。现在的做法是：

> **中文只索引双字词（bigram），英文与标识符按原样索引。**

## 2. 关键词抽取

`src/main/ingestion/search-tokenizer.ts`：

1. `stripQueryStopwords()`：去掉疑问词与泛化动词（怎么、如何、有哪几种、区别、设置、配置…）。
2. 按标点与虚词（的 / 和 / 与 / 及 / 或）切分。
3. 保留英文标识符（`PA9`、`USART1_TX`）与长度 ≥2 的中文短语。

示例：

| 提问 | 抽取结果 |
|---|---|
| GPIO 推挽输出和开漏输出有什么区别 | `GPIO` `推挽输出` `开漏输出` |
| 低功耗模式有哪几种 | `低功耗模式` |
| PA9 怎么配置成 USART1_TX | `PA9` `USART1_TX` |
| CAN 总线过滤器怎么设置 | `CAN` `总线过滤器` |

## 3. 领域词表

`src/main/search/domain-lexicon.ts` 定义 26 组概念，把中文说法映射到寄存器级术语，
例如：独立看门狗 → `IWDG` / `IWDG_PR` / `IWDG_RLR`；复用功能重映射 → `AFIO_MAPR` / `REMAP`。

这些扩展词作为**独立的一路查询**参与融合，权重低于用户关键词，只用于补充召回。

## 4. 多路查询与融合

`buildRetrievalPlan()` 为一次提问生成多路查询，并给出权重：

| 查询路 | 权重 |
|---|---|
| 关键词合路 | 1.25 |
| 单个关键词（取最长的两个） | 1.15 |
| 标识符 / 外设 / 别名合路 | 1.05 |
| 领域词表扩展 | 0.95 |
| 原始整句 | 0.9 |
| 针对已知问题的结构化 aspect | 0.85 |

各路结果用 RRF（`1/(60+rank)`）融合，同一文本块在多路中同时靠前才会胜出。

## 5. 单路检索打分

`src/main/search/lexical-search.ts`：

1. **文档频率过滤**：出现于超过 20% 文本块的词直接剔除；若全被剔除则退化为低频优先。
2. FTS5 `MATCH` 取候选（最多 `limit × 4` 条）。
3. 每条候选重新打分（0~1）：

   ```
   0.35 × 归一化 BM25
 + 0.25 × 关键词覆盖率
 + 0.20 × 原文短语命中率
 + 0.20 × 编号小节标题命中率
   ```

   其中「编号小节」指 `4.3 低功耗模式` 这类形如 `<编号> <关键词>` 的标题，
   是技术手册中最强的定位信号。

## 6. 目录定向

`src/main/search/section-index.ts` 把关键词与 `toc_nodes` 匹配：
命中章节的**起始页**加 0.55，章节范围内页加 0.18。

## 7. 重排与多样性

`src/main/search/retrieval-reranker.ts`：

- 过滤目录 / 参考文献 / 点线引导符页面。
- 命中标识符（寄存器名、引脚名）加权，命中章节标题中的关键词加权。
- 按目录章节做多样性选择，保证多个子问题都能拿到证据；
  某个方向只能匹配到很弱结果时不再强行塞入。

## 8. 可选向量检索

配置 embedding 模型后，查询向量与 `embeddings` 表做余弦相似度检索，
作为权重 1.15 的一路加入 RRF。索引可在设置里点「重建向量索引」生成。

## 9. 基准测试

```powershell
npx tsx scripts/check-retrieval.ts artifacts/bench-data   # 建库并抽样观察
npx tsx scripts/smoke-retrieval.ts artifacts/bench-data   # 95 题冒烟
npx tsx scripts/check-extraction.ts                       # 解析覆盖率
npx tsx scripts/check-migration.ts artifacts/bench-data   # 旧索引迁移
```

`smoke-retrieval.ts` 的题目由两部分组成：

- **手写真实问法**：覆盖 GPIO / USART / ADC / DMA / 看门狗 / RTC / CAN / USB 等主题，
  逐题给出必须命中的术语。
- **目录自动生成**：从 `toc_nodes` 抽样章节标题生成「<标题> 怎么配置」，
  标准答案是该章节的页区间（由同级下一个目录节点自动推导），避免人工标注偏差。

调优时请以这两个集合的合计命中率为准，不要只针对单题改规则。
