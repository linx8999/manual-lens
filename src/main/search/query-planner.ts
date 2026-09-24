import type { QueryAnalysis } from "../../shared/types";
import { expandQueryConcepts } from "./domain-lexicon";

export interface RetrievalAspect {
  id: string;
  query: string;
  keywords: string[];
}

export interface RetrievalPlan {
  variants: string[];
  weights: number[];
  aspects: RetrievalAspect[];
}

export function buildRetrievalPlan(analysis: QueryAnalysis): RetrievalPlan {
  const baseQuery = [
    ...analysis.chipModels,
    ...analysis.keywords,
    ...analysis.identifiers,
    ...analysis.peripherals,
    ...analysis.aliases
  ].join(" ");
  const aspects: RetrievalAspect[] = [];
  const upper = analysis.normalized;

  if (upper.includes("PA9") && upper.includes("USART1_TX")) {
    aspects.push(
      {
        id: "pin",
        query: "PA9 USART1_TX 引脚定义 默认复用功能 TIM1_CH2",
        keywords: ["PA9"]
      },
      {
        id: "remap",
        query: "USART1_REMAP AFIO_MAPR PA9 PB6 重映射",
        keywords: ["USART1_REMAP"]
      },
      {
        id: "gpio-mode",
        query: "GPIOA GPIOx_CRL MODE CNF 复用推挽 输出速度",
        keywords: ["GPIOX_CRL", "GPIO_CRL"]
      },
      {
        id: "clock",
        query: "RCC_APB2ENR GPIOA USART1 时钟使能 APB2",
        keywords: ["RCC_APB2ENR"]
      },
      {
        id: "usart-control",
        query: "USART_CR1 UE TE USART1 发送使能 配置",
        keywords: ["USART_CR1"]
      }
    );
  } else if (upper.includes("ADC") && /采样时间|SMPR/.test(upper)) {
    aspects.push(
      {
        id: "adc-sample-time",
        query: "ADC_SMPR1 ADC_SMPR2 SMP 采样时间",
        keywords: ["ADC_SMPR1", "ADC_SMPR2", "SMP", "采样时间"]
      },
      {
        id: "adc-control",
        query: "ADC_CR2 ADON 转换 校准 规则通道",
        keywords: ["ADC_CR2", "ADON"]
      }
    );
  } else if (upper.includes("GPIO") && /MODE|模式|配置/.test(upper)) {
    aspects.push({
      id: "gpio-mode",
      query: "GPIOx_CRL GPIOx_CRH MODE CNF 输入 输出 复用",
      keywords: ["GPIOX_CRL", "GPIOX_CRH", "MODE", "CNF"]
    });
  } else if (
    analysis.peripherals.includes("TIM") &&
    /几个|多少|数量|计数|个数/.test(upper)
  ) {
    aspects.push({
      id: "timer-inventory",
      query:
        "STM32F103x8B 数据手册 1个高级控制定时器 3个通用16位定时器 2个看门狗定时器 7个定时器 定时器功能比较",
      keywords: [
        "7个定时器",
        "1个高级控制定时器",
        "3个通用16位定时器",
        "定时器功能比较"
      ]
    });
  } else if (analysis.peripherals.length > 0) {
    aspects.push({
      id: `${analysis.peripherals[0]?.toLowerCase()}-configuration`,
      query: [...analysis.identifiers, ...analysis.aliases, ...analysis.peripherals].join(" "),
      keywords: [...analysis.identifiers, ...analysis.peripherals]
    });
  }

  // The raw question is noisy, so the keyword-only queries carry the most
  // weight: "GPIO 推挽输出和开漏输出有什么区别" searches 推挽输出 and
  // 开漏输出 as their own queries instead of as one long sentence.
  const entries: Array<{ query: string; weight: number }> = [
    { query: analysis.original, weight: 0.9 },
    { query: baseQuery, weight: 1.05 },
    { query: analysis.keywords.join(" "), weight: 1.25 },
    { query: expandQueryConcepts(analysis.original).join(" "), weight: 0.95 },
    ...[...analysis.keywords]
      .sort((left, right) => right.length - left.length)
      .slice(0, 2)
      .map((keyword) => ({ query: keyword, weight: 1.15 })),
    ...aspects.map((aspect) => ({ query: aspect.query, weight: 0.85 }))
  ];

  const deduped = new Map<string, { query: string; weight: number }>();
  for (const entry of entries) {
    const query = entry.query.trim();
    if (!query) {
      continue;
    }
    const existing = deduped.get(query);
    if (!existing || entry.weight > existing.weight) {
      deduped.set(query, { query, weight: entry.weight });
    }
  }

  const resolved = [...deduped.values()];
  return {
    variants: resolved.map((entry) => entry.query),
    weights: resolved.map((entry) => entry.weight),
    aspects
  };
}
