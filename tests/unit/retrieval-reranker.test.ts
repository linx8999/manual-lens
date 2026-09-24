import { describe, expect, it } from "vitest";
import { analyzeQuery } from "../../src/main/search/query-analyzer";
import { rerankHits } from "../../src/main/search/retrieval-reranker";
import type { SearchHit } from "../../src/main/search/rrf";

function hit(id: string, text: string, heading: string | null = null): SearchHit {
  return {
    chunkId: id,
    documentId: `doc-${id}`,
    documentTitle: id.includes("ref") ? "STM32F10xxx参考手册" : "其他资料",
    pageNumber: Number(id.match(/\d+/)?.[0] ?? 1),
    printedPage: null,
    heading,
    text,
    score: 0.01,
    rank: 1
  };
}

describe("rerankHits", () => {
  it("prioritizes pages containing the exact identifiers in the question", () => {
    const analysis = analyzeQuery("PA9 怎么配置成 USART1_TX");
    const result = rerankHits(
      [
        hit("generic-1", "CRC 计算单元和数据窗口看门狗"),
        hit("datasheet-19", "PA9 的默认复用功能包括 USART1_TX。"),
        hit(
          "ref-120",
          "USART1_REMAP = 0 时 USART1_TX 对应 PA9；重映射后对应 PB6。",
          "USART1 重映射"
        )
      ],
      analysis
    );

    expect(result[0]?.chunkId).toBe("ref-120");
    expect(result.map((item) => item.chunkId)).not.toContain("generic-1");
  });

  it("keeps exact identifier hits even when they originate from different documents", () => {
    const analysis = analyzeQuery("PA9 怎么配置成 USART1_TX");
    const result = rerankHits(
      [
        hit("ref-120", "USART1_TX 对应 PA9。", "复用功能"),
        hit("datasheet-19", "PA9 默认复用 USART1_TX。", "引脚定义"),
        hit("other-2", "USART2 配置")
      ],
      analysis
    );

    expect(result.map((item) => item.chunkId)).toEqual([
      "ref-120",
      "datasheet-19"
    ]);
  });
});
