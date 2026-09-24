import { describe, expect, it } from "vitest";
import { normalizeOcrText } from "../../src/main/vision/image-matcher";

describe("normalizeOcrText", () => {
  it("joins Chinese glyphs that the OCR engine spaced apart", () => {
    expect(normalizeOcrText("低 功 耗 模 式")).toBe("低功耗模式");
  });

  it("keeps latin word boundaries intact", () => {
    expect(normalizeOcrText("usart1 brr")).toBe("USART1 BRR");
  });

  it("drops punctuation that would otherwise break search terms", () => {
    expect(normalizeOcrText("低功耗模式（一）")).toBe("低功耗模式 一");
  });
});
