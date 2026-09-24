interface Concept {
  id: string;
  triggers: RegExp;
  terms: string[];
}

/**
 * STM32 manuals mix Chinese wording with English register names. The lexicon
 * bridges the two so a question phrased in Chinese still reaches the register
 * level text, and vice versa.
 */
const CONCEPTS: Concept[] = [
  { id: "usart", triggers: /串口|串行|USART|UART/, terms: ["USART", "UART", "USART_BRR", "USART_CR1"] },
  { id: "gpio", triggers: /引脚|端口|GPIO|输入输出|I\/O/, terms: ["GPIO", "GPIOx_CRL", "GPIOx_CRH"] },
  { id: "remap", triggers: /重映射|重映像|复用功能|AFIO/, terms: ["AFIO_MAPR", "REMAP", "AFIO"] },
  { id: "timer", triggers: /定时器|计数器|TIM/, terms: ["TIM", "TIMx_PSC", "TIMx_ARR", "TIMx_CR1"] },
  { id: "nvic", triggers: /中断优先级|NVIC|中断向量/, terms: ["NVIC", "NVIC_IPR", "ISER", "ICER"] },
  { id: "exti", triggers: /外部中断|EXTI|边沿触发/, terms: ["EXTI", "EXTI_RTSR", "EXTI_FTSR", "AFIO_EXTICR"] },
  { id: "adc", triggers: /模数|模拟数字|ADC|采样/, terms: ["ADC", "ADC_SMPR1", "ADC_SMPR2", "ADC_CR2"] },
  { id: "dma", triggers: /DMA|直接存储器访问/, terms: ["DMA", "DMA_CCR", "DMA_CPAR", "DMA_CMAR"] },
  { id: "iwdg", triggers: /独立看门狗|IWDG/, terms: ["IWDG", "IWDG_PR", "IWDG_RLR", "IWDG_KR"] },
  { id: "wwdg", triggers: /窗口看门狗|WWDG/, terms: ["WWDG", "WWDG_CR", "WWDG_CFR"] },
  { id: "pwr", triggers: /低功耗|睡眠模式|停止模式|待机模式|电源控制|PWR/, terms: ["PWR", "PWR_CR", "PWR_CSR", "SLEEPDEEP"] },
  { id: "rcc", triggers: /时钟|RCC|PLL/, terms: ["RCC", "RCC_CR", "RCC_CFGR", "PLL"] },
  { id: "flash", triggers: /闪存|FLASH|烧写/, terms: ["FLASH", "FLASH_CR", "FLASH_SR"] },
  { id: "spi", triggers: /SPI|主从模式/, terms: ["SPI", "SPI_CR1", "SPI_SR"] },
  { id: "i2c", triggers: /I2C|IIC|从机地址/, terms: ["I2C", "I2C_OAR1", "I2C_CR1"] },
  { id: "can", triggers: /CAN|过滤器|筛选器/, terms: ["CAN", "CAN_FMR", "CAN_FA1R"] },
  { id: "rtc", triggers: /实时时钟|RTC/, terms: ["RTC", "RTC_CR", "RTC_ALR"] },
  { id: "bkp", triggers: /备份区域|备份寄存器|BKP/, terms: ["BKP", "BKP_DR"] },
  { id: "usb", triggers: /USB|设备模式|主机模式|OTG/, terms: ["USB", "OTG_FS"] },
  { id: "systick", triggers: /SYSTICK|系统节拍/, terms: ["SysTick", "STK_CTRL", "STK_LOAD"] },
  { id: "preemption", triggers: /抢占优先级|响应优先级|优先级/, terms: ["NVIC_IPR", "preemption", "subpriority"] },
  { id: "prescaler", triggers: /预分频|分频系数/, terms: ["PSC", "PR", "prescaler"] },
  { id: "reload", triggers: /自动重装载|重装载|ARR/, terms: ["ARR", "RLR", "auto-reload"] },
  { id: "pu-pd", triggers: /推挽|开漏|上拉|下拉/, terms: ["CNF", "push-pull", "open-drain"] },
  { id: "idle", triggers: /空闲中断|IDLE/, terms: ["IDLE", "USART_SR"] },
  { id: "interrupt", triggers: /中断/, terms: ["IRQ", "interrupt"] }
];

/** Extra search terms implied by the wording of the question. */
export function expandQueryConcepts(text: string): string[] {
  const normalized = text.normalize("NFKC").toUpperCase();
  const expanded: string[] = [];
  for (const concept of CONCEPTS) {
    if (concept.triggers.test(normalized)) {
      expanded.push(...concept.terms);
    }
  }
  return [...new Set(expanded)];
}

/** The concept ids a question touches, used for logging and prompts. */
export function detectConcepts(text: string): string[] {
  const normalized = text.normalize("NFKC").toUpperCase();
  return CONCEPTS.filter((concept) => concept.triggers.test(normalized)).map(
    (concept) => concept.id
  );
}
