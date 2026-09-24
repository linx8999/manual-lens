import { resolve } from "node:path";
import { RetrievalService } from "../src/main/search/retrieval-service";
import { AppDatabase } from "../src/main/storage/database";

interface Case {
  question: string;
  documentId?: string;
  pageFrom?: number;
  pageTo?: number;
  mustInclude?: RegExp;
}

const dataRoot = resolve(process.argv[2] ?? "artifacts/bench-data-v2");
const database = await AppDatabase.open(dataRoot);
const retrieval = new RetrievalService({ database });

const handwritten: Case[] = [
  { question: "PA9 怎么配置成 USART1_TX？", pageFrom: 118, pageTo: 122 },
  { question: "串口1的波特率怎么设置", mustInclude: /USART_BRR|波特率/ },
  { question: "GPIO 推挽输出和开漏输出有什么区别", mustInclude: /推挽|开漏/ },
  { question: "TIM2 的更新中断怎么开启", mustInclude: /TIMx_DIER|更新中断|更新事件/ },
  { question: "ADC 的采样时间怎么配置", mustInclude: /ADC_SMPR|采样时间/ },
  { question: "STM32F103C8T6 有几个定时器", mustInclude: /定时器/ },
  { question: "外部中断怎么配置", mustInclude: /EXTI/ },
  { question: "独立看门狗的溢出时间怎么算", mustInclude: /IWDG/ },
  { question: "SPI 主机模式怎么初始化", mustInclude: /SPI_CR1|MSTR|主模式/ },
  { question: "I2C 的从机地址怎么设置", mustInclude: /OAR1|地址/ },
  { question: "系统时钟最高可以到多少频率", mustInclude: /PLL|72MHz|时钟/ },
  { question: "DMA 怎么配置存储器到外设的传输", mustInclude: /DMA_CMAR|DMA_CPAR|存储器/ },
  { question: "复位后 GPIO 引脚默认是什么状态", mustInclude: /GPIO|复位/ },
  { question: "Flash 编程的步骤是什么", mustInclude: /FLASH|闪存/ },
  { question: "低功耗模式有哪几种", pageFrom: 39, pageTo: 45 },
  { question: "待机模式怎么唤醒", mustInclude: /待机|唤醒/ },
  { question: "NVIC 中断优先级怎么设置", mustInclude: /NVIC|优先/ },
  { question: "定时器预分频系数怎么计算", mustInclude: /预分频|TIMx_PSC/ },
  { question: "ADC 规则通道和注入通道的区别", mustInclude: /规则|注入/ },
  { question: "USART 中断使能位怎么设置", mustInclude: /USART_CR1|TXEIE|使能/ },
  { question: "窗口看门狗怎么配置", mustInclude: /WWDG/ },
  { question: "CAN 总线过滤器怎么设置", mustInclude: /CAN|过滤器/ },
  { question: "USB 设备模式怎么初始化", mustInclude: /USB/ },
  { question: "实时时钟 RTC 怎么配置秒中断", mustInclude: /RTC/ },
  { question: "备份区域寄存器怎么写保护", mustInclude: /BKP|备份/ },
  { question: "外部晶振起振失败怎么排查", mustInclude: /HSE|晶振|起振/ },
  { question: "GPIO 输出速度怎么选择", mustInclude: /输出速度|MODE/ },
  { question: "复用功能重映射怎么开启", mustInclude: /AFIO_MAPR|重映射/ },
  { question: "sysTick 定时器怎么配置", mustInclude: /SysTick|系统节拍|STK/ },
  { question: "串口接收中断怎么处理", mustInclude: /USART_SR|RXNE|接收/ },
  { question: "GPIO 输入模式有哪几种", mustInclude: /输入|浮空|上拉|下拉/ },
  { question: "ADC 转换时间怎么计算", mustInclude: /转换时间|采样时间|ADC/ },
  { question: "USART 接收中断怎么开启", mustInclude: /RXNEIE|接收中断|USART_CR1/ },
  { question: "SPI 的 CPOL 和 CPHA 怎么设置", mustInclude: /CPOL|CPHA/ },
  { question: "I2C 起始条件怎么产生", mustInclude: /起始|START|I2C_CR1/ },
  { question: "CAN 的波特率怎么配置", mustInclude: /CAN|波特率/ },
  { question: "RTC 闹钟怎么设置", mustInclude: /RTC_ALR|闹钟|ALR/ },
  { question: "怎么进入停止模式", mustInclude: /停止模式|PWR_CR|LPDS/ },
  { question: "外部中断触发边沿怎么选择", mustInclude: /EXTI_RTSR|EXTI_FTSR|上升沿|下降沿/ },
  { question: "定时器 PWM 模式怎么配置", mustInclude: /PWM|TIMx_CCMR|OC/ },
  { question: "怎么读取 ADC 转换结果", mustInclude: /ADC_DR|转换结果|数据寄存器/ },
  { question: "GPIO 复用功能怎么开启", mustInclude: /复用|AFIO|CNF/ },
  { question: "系统复位有哪几种方式", mustInclude: /复位|RESET|NRST/ },
  { question: "DMA 循环模式怎么配置", mustInclude: /CIRC|循环/ },
  { question: "看门狗喂狗时间怎么设置", mustInclude: /IWDG|WWDG|喂狗|重装载/ },
  { question: "怎么关闭 JTAG 释放引脚", mustInclude: /JTAG|SWJ_CFG|AFIO_MAPR/ },
  { question: "中断抢占优先级和响应优先级有什么区别", mustInclude: /抢占|响应|优先/ },
  { question: "串口校验位怎么配置", mustInclude: /PCE|校验|USART_CR1/ },
  { question: "Flash 擦除和写入有什么区别", mustInclude: /擦除|写入|FLASH/ },
  { question: "待机模式下 RTC 还能工作吗", mustInclude: /待机|RTC|唤醒/ },
  { question: "怎么把 PC13 配置成输出引脚", mustInclude: /PC13|GPIO|输出/ }
];

interface TocRow {
  document_id: string;
  title: string;
  level: number;
  page_number: number;
}

const rawToc = database.query<TocRow>(
  `SELECT t.document_id, t.title, t.level, t.page_number
   FROM toc_nodes t
   WHERE length(t.title) >= 5
     AND t.title NOT LIKE '%目录%'
     AND t.title NOT LIKE '%相关文档%'
     AND t.title NOT LIKE '%参考文献%'
     AND t.title NOT LIKE '%版本%'
     AND t.title NOT LIKE '%.png%'
     AND t.title NOT LIKE '%.jpg%'
     AND t.title NOT LIKE '%.xlsx%'
     AND t.title NOT LIKE '%.pdf%'
   ORDER BY t.document_id, t.page_number`
);

const documentTitles = new Map(
  database
    .query<{ id: string; title: string }>("SELECT id, title FROM documents")
    .map((row) => [row.id, row.title])
);

const documentPageCounts = new Map(
  database
    .query<{ id: string; page_count: number }>("SELECT id, page_count FROM documents")
    .map((row) => [row.id, row.page_count])
);

const tocByDocument = new Map<string, TocRow[]>();
for (const row of rawToc) {
  const list = tocByDocument.get(row.document_id) ?? [];
  list.push(row);
  tocByDocument.set(row.document_id, list);
}

const NON_TECHNICAL = /一路走来|前言|致谢|索引|术语|词汇|关于本|声明|修订|勘误|设计提示|提示和技巧/;

/** A section owns every page until the next node at the same or higher level. */
function sectionEndPage(node: TocRow): number {
  const pageCount = documentPageCounts.get(node.document_id) ?? node.page_number;
  const siblings = tocByDocument.get(node.document_id) ?? [];
  for (const other of siblings) {
    if (other.page_number > node.page_number && other.level <= node.level) {
      return Math.max(node.page_number, other.page_number - 1);
    }
  }
  return Math.max(node.page_number, pageCount);
}

const generated: Case[] = [];
const step = Math.max(1, Math.floor(rawToc.length / 45));
for (let index = 0; index < rawToc.length && generated.length < 45; index += step) {
  const node = rawToc[index];
  if (!node) {
    continue;
  }
  const title = node.title.replace(/^\s*\d+(\.\d+)*\s*/, "").trim();
  if (title.length < 4 || NON_TECHNICAL.test(title)) {
    continue;
  }
  generated.push({
    question: `${title} 怎么配置`,
    documentId: node.document_id,
    pageFrom: node.page_number,
    pageTo: sectionEndPage(node)
  });
}

async function run(cases: Case[], label: string): Promise<{ passed: number; failed: Case[] }> {
  let passed = 0;
  const failed: Case[] = [];
  for (const item of cases) {
    const bundle = await retrieval.retrieve(item.question, 8);
    const hit = bundle.sources.some((source) => {
      if (item.documentId && source.documentId !== item.documentId) {
        return false;
      }
      if (item.pageFrom !== undefined && source.pageNumber < item.pageFrom) {
        return false;
      }
      if (item.pageTo !== undefined && source.pageNumber > item.pageTo) {
        return false;
      }
      if (item.mustInclude) {
        const haystack = `${source.heading ?? ""}\n${source.excerpt}`;
        if (!item.mustInclude.test(haystack)) {
          return false;
        }
      }
      return true;
    });
    if (hit) {
      passed += 1;
    } else {
      failed.push(item);
    }
  }
  const rate = ((passed / cases.length) * 100).toFixed(1);
  console.log(`\n[${label}] ${passed}/${cases.length} passed (${rate}%)`);
  for (const item of failed) {
    const bundle = await retrieval.retrieve(item.question, 8);
    const top = bundle.sources
      .slice(0, 3)
      .map(
        (source) =>
          `p${source.pageNumber} ${source.documentTitle.slice(0, 12)} [${(source.heading ?? "-").slice(0, 18)}]`
      )
      .join(" | ");
    const expected = item.documentId
      ? `${(documentTitles.get(item.documentId) ?? item.documentId).slice(0, 14)} p${item.pageFrom}-${item.pageTo}`
      : (item.mustInclude?.toString() ?? "-");
    console.log(
      `   MISS ${item.question}\n        expect: ${expected}\n        got:    ${top || "(none)"}`
    );
  }
  return { passed, failed };
}

const handwrittenResult = await run(handwritten, "handwritten");
const generatedResult = await run(generated, "toc-generated");
const totalCases = handwritten.length + generated.length;
const totalPassed = handwrittenResult.passed + generatedResult.passed;
console.log(
  `\nTOTAL ${totalPassed}/${totalCases} (${((totalPassed / totalCases) * 100).toFixed(1)}%)`
);

database.close();
