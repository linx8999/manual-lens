import { describe, expect, it } from "vitest";
import { analyzeQuery } from "../../src/main/search/query-analyzer";
import { buildRetrievalPlan } from "../../src/main/search/query-planner";

describe("buildRetrievalPlan", () => {
  it("decomposes a PA9 multiplexing question into retrieval aspects", () => {
    const plan = buildRetrievalPlan(
      analyzeQuery("PA9 怎么配置成 USART1_TX")
    );

    expect(plan.variants.length).toBeGreaterThanOrEqual(5);
    expect(plan.aspects.map((aspect) => aspect.id)).toEqual(
      expect.arrayContaining(["pin", "remap", "gpio-mode", "clock", "usart-control"])
    );
    expect(plan.variants.join(" ").toUpperCase()).toContain("RCC_APB2ENR");
    expect(plan.variants.join(" ").toUpperCase()).toContain("USART_CR1");
  });
});
