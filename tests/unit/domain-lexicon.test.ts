import { describe, expect, it } from "vitest";
import {
  detectConcepts,
  expandQueryConcepts
} from "../../src/main/search/domain-lexicon";

describe("domain lexicon", () => {
  it("maps Chinese wording onto register level terms", () => {
    const terms = expandQueryConcepts("独立看门狗溢出时间怎么算");
    expect(terms).toEqual(expect.arrayContaining(["IWDG", "IWDG_PR", "IWDG_RLR"]));
  });

  it("expands a remap question to the AFIO registers", () => {
    expect(expandQueryConcepts("复用功能重映射怎么开启")).toEqual(
      expect.arrayContaining(["AFIO_MAPR", "REMAP"])
    );
  });

  it("recognises the peripherals a question touches", () => {
    expect(detectConcepts("串口波特率怎么设置")).toContain("usart");
    expect(detectConcepts("待机模式怎么唤醒")).toContain("pwr");
  });

  it("returns nothing for wording outside the lexicon", () => {
    expect(expandQueryConcepts("今天天气怎么样")).toEqual([]);
  });
});
