import { describe, expect, it } from "vitest";
import { extractQueryKeywords } from "../../src/main/ingestion/search-tokenizer";
import { analyzeQuery } from "../../src/main/search/query-analyzer";

describe("extractQueryKeywords", () => {
  it("keeps the technical phrase and drops the interrogative tail", () => {
    expect(extractQueryKeywords("低功耗模式有哪几种")).toEqual(["低功耗模式"]);
  });

  it("splits a comparison question into both concepts", () => {
    expect(extractQueryKeywords("GPIO 推挽输出和开漏输出有什么区别")).toEqual([
      "GPIO",
      "推挽输出",
      "开漏输出"
    ]);
  });

  it("keeps identifiers with their part number", () => {
    expect(extractQueryKeywords("PA9 怎么配置成 USART1_TX")).toEqual([
      "PA9",
      "USART1_TX"
    ]);
  });

  it("drops meta verbs from the search keywords", () => {
    expect(extractQueryKeywords("CAN 总线过滤器怎么设置")).toEqual([
      "CAN",
      "总线过滤器"
    ]);
  });

  it("exposes the keywords on the query analysis", () => {
    expect(analyzeQuery("独立看门狗的溢出时间怎么算").keywords).toEqual([
      "独立看门狗",
      "溢出时间"
    ]);
  });
});
