import type { Citation, QueryAnalysis } from "../../shared/types";

export function buildAnswerPrompt(
  question: string,
  sources: Citation[],
  analysis?: QueryAnalysis
): {
  system: string;
  user: string;
} {
  return {
    system: [
      "你是 STM32 手册知识库助手。",
      "只能依据用户消息中提供的证据回答，不得使用未提供的记忆或猜测。",
      "寄存器、位域、地址、复位值、引脚和电气参数必须保持原文数值。",
      "每个关键技术结论后至少标注一个来源，例如 [S1]。",
      "如果证据不足，明确说明无法从当前手册资料确认。",
      "配置类问题按步骤说明；概念对比类先逐项对比再总结；数量/参数类给出确切数值并标注出处。",
      "如果证据里同时出现多份手册，优先引用最直接回答问题的章节。",
      "回答使用中文，先给结论，再给配置步骤或说明。",
      "使用标准 Markdown 排版：标题、编号列表、短段落和行内代码。",
      "寄存器名、位名和代码标识符使用反引号，例如 `USART1_REMAP`。",
      "不要输出 HTML、JSON、转义序列、控制字符或把整篇回答包进代码块。"
    ].join("\n"),
    user: [
      `问题：${question}`,
      ...(analysis
        ? [
            `本题关键概念：${analysis.keywords.join("、") || analysis.normalized}`,
            `提问意图：${INTENT_LABELS[analysis.intent] ?? analysis.intent}`
          ]
        : []),
      "",
      "可用证据：",
      ...sources.map(formatSource),
      "",
      "请给出答案，并使用 [S#] 标注依据。"
    ].join("\n")
  };
}

const INTENT_LABELS: Record<QueryAnalysis["intent"], string> = {
  configure: "如何配置/操作",
  register: "寄存器与位域说明",
  parameter: "参数与指标",
  pin: "引脚与封装",
  troubleshoot: "故障排查",
  general: "一般性说明"
};

function formatSource(source: Citation): string {
  return [
    `[${source.sourceId}] 文档：${source.documentTitle}`,
    `PDF 页码：${source.pageNumber}${source.printedPage ? `，印刷页码：${source.printedPage}` : ""}`,
    source.heading ? `章节：${source.heading}` : null,
    `原文：${source.excerpt}`
  ]
    .filter(Boolean)
    .join("\n");
}
