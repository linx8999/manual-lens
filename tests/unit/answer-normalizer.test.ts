import { describe, expect, it } from "vitest";
import { normalizeModelAnswer } from "../../src/main/chat/answer-normalizer";

describe("normalizeModelAnswer", () => {
  it("removes control characters and collapses excessive blank lines", () => {
    const normalized = normalizeModelAnswer(
      "结论：\u200BPA9\r\n\r\n\r\n\r\n**配置**  \n"
    );

    expect(normalized).toBe("结论：PA9\n\n**配置**");
  });

  it("preserves Markdown and register identifiers", () => {
    const normalized = normalizeModelAnswer(
      "## 步骤\n\n1. 设置 `USART1_REMAP = 0`。"
    );

    expect(normalized).toBe("## 步骤\n\n1. 设置 `USART1_REMAP = 0`。");
  });
});
