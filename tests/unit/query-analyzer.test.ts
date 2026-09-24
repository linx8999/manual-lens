import { describe, expect, it } from "vitest";
import { analyzeQuery } from "../../src/main/search/query-analyzer";

describe("analyzeQuery", () => {
  it("extracts chip, pin and peripheral identifiers", () => {
    const analysis = analyzeQuery("STM32F103C8T6 的 PA9 怎么配置成 USART1_TX");

    expect(analysis.chipModels).toContain("STM32F103C8T6");
    expect(analysis.identifiers).toEqual(expect.arrayContaining(["PA9", "USART1_TX"]));
    expect(analysis.identifiers).toContain("USART1_REMAP");
    expect(analysis.peripherals).toContain("USART");
    expect(analysis.intent).toBe("configure");
  });

  it("expands Chinese peripheral names", () => {
    const analysis = analyzeQuery("串口发送不了数据，检查时钟树");

    expect(analysis.aliases).toEqual(expect.arrayContaining(["UART", "USART", "RCC", "AHB", "APB"]));
    expect(analysis.peripherals).toEqual(expect.arrayContaining(["USART", "RCC"]));
  });
});
