import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { _electron as electron } from "playwright";

const outputDir = resolve("artifacts");
await mkdir(outputDir, { recursive: true });

const dataRoot = process.env.STM32_RAG_DATA_ROOT;
if (!dataRoot) {
  throw new Error(
    "请先设置 STM32_RAG_DATA_ROOT 指向本机资料库目录（默认位置为当前用户文档目录下的 STM32RAG知识库）。"
  );
}

const electronApp = await electron.launch({
  args: [resolve(".")],
  cwd: resolve("."),
  env: {
    ...process.env,
    STM32_RAG_DATA_ROOT: dataRoot
  }
});

try {
  const page = await electronApp.firstWindow();
  const conversation = page.locator(".conversation-section .list-main").first();
  await conversation.waitFor({ state: "visible", timeout: 30000 });
  await conversation.click();
  await page.locator(".markdown-body").last().waitFor({
    state: "visible",
    timeout: 30000
  });
  await page.screenshot({
    path: resolve(outputDir, "ui-formatted-answer.png"),
    fullPage: true
  });
} finally {
  await electronApp.close();
}
