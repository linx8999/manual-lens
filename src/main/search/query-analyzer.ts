import type { QueryAnalysis } from "../../shared/types";
import { extractQueryKeywords } from "../ingestion/search-tokenizer";

const PERIPHERALS = [
  "GPIO",
  "USART",
  "UART",
  "SPI",
  "I2C",
  "ADC",
  "DAC",
  "TIM",
  "RCC",
  "NVIC",
  "EXTI",
  "DMA",
  "RTC",
  "CAN",
  "USB",
  "FLASH",
  "IWDG",
  "WWDG",
  "AFIO",
  "BKP",
  "PWR"
] as const;

const ALIAS_MAP: Array<{ pattern: RegExp; aliases: string[] }> = [
  { pattern: /串口|异步串行/, aliases: ["UART", "USART"] },
  { pattern: /时钟树|时钟|总线/, aliases: ["RCC", "AHB", "APB"] },
  { pattern: /中断控制器|中断/, aliases: ["NVIC", "EXTI"] },
  { pattern: /通用输入输出|输入输出口|引脚/, aliases: ["GPIO", "AFIO"] },
  { pattern: /闪存|存储器|烧写/, aliases: ["FLASH"] },
  { pattern: /模拟数字转换/, aliases: ["ADC"] },
  { pattern: /直接存储器访问/, aliases: ["DMA"] },
  { pattern: /看门狗/, aliases: ["IWDG", "WWDG"] },
  { pattern: /定时器|计数器/, aliases: ["TIM"] }
];

export function analyzeQuery(input: string): QueryAnalysis {
  const normalized = input.normalize("NFKC").toUpperCase();
  const chipModels = unique(normalized.match(/STM32[A-Z0-9]{3,}/g) ?? []);
  const identifierPattern =
    /\b(?:P[A-G]\d{1,2}|(?:GPIO|USART|UART|SPI|I2C|TIM|ADC|DAC|DMA|EXTI|AFIO|NVIC|RCC|FLASH|IWDG|WWDG|BKP|PWR)[A-Z0-9_]*|[A-Z]{2,12}_[A-Z0-9_]+)\b/g;
  const identifiers = unique([
    ...(normalized.match(identifierPattern) ?? []),
    ...inferIdentifiers(normalized)
  ]);
  const aliases: string[] = [];

  for (const mapping of ALIAS_MAP) {
    if (mapping.pattern.test(input)) {
      aliases.push(...mapping.aliases);
    }
  }
  // SysTick is a Cortex-M core timer, not one of the TIM peripherals.
  if (/SYSTICK|系统节拍/.test(normalized)) {
    for (let index = aliases.length - 1; index >= 0; index -= 1) {
      if (aliases[index] === "TIM") {
        aliases.splice(index, 1);
      }
    }
  }

  const peripheralCandidates = [...identifiers, ...aliases].map((value) =>
    PERIPHERALS.find((peripheral) => value.startsWith(peripheral))
  );
  const peripherals = unique(
    peripheralCandidates.filter(
      (value): value is (typeof PERIPHERALS)[number] => value !== undefined
    )
  );

  return {
    original: input,
    normalized,
    keywords: extractQueryKeywords(input),
    chipModels,
    peripherals,
    identifiers,
    aliases: unique(aliases),
    intent: detectIntent(input)
  };
}

function inferIdentifiers(normalized: string): string[] {
  const inferred: string[] = [];
  if (normalized.includes("PA9") && normalized.includes("USART1_TX")) {
    inferred.push(
      "USART1_REMAP",
      "AFIO_MAPR",
      "GPIOA",
      "GPIOX_CRL",
      "RCC_APB2ENR",
      "USART_CR1"
    );
  }
  if (normalized.includes("USART1_TX") && /配置|设置|重映射/.test(normalized)) {
    inferred.push("USART1_REMAP", "AFIO_MAPR");
  }
  if (normalized.includes("ADC") && /采样时间|SMPR/.test(normalized)) {
    inferred.push("ADC_SMPR1", "ADC_SMPR2");
  }
  if (normalized.includes("GPIO") && /MODE|模式|配置/.test(normalized)) {
    inferred.push("GPIOX_CRL", "GPIOX_CRH");
  }
  if (normalized.includes("NVIC")) {
    inferred.push("ISER", "ICER", "IPR");
  }
  return inferred;
}

function detectIntent(input: string): QueryAnalysis["intent"] {
  if (/怎么|如何|配置|设置|初始化|使能/.test(input)) return "configure";
  if (/寄存器|位|地址|复位值|CNF|MODE|MAPR/.test(input)) return "register";
  if (/参数|电压|电流|频率|温度|功耗|速率/.test(input)) return "parameter";
  if (/引脚|封装|PA\d|PB\d|PC\d|PD\d/.test(input)) return "pin";
  if (/错误|失败|不工作|无输出|排查|原因/.test(input)) return "troubleshoot";
  return "general";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
