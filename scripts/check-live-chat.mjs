import { resolve } from "node:path";
import { _electron as electron } from "playwright";

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
  const input = page.getByLabel("输入 STM32 问题");
  await input.fill("请只回复 OK");
  await input.press("Enter");

  await page.waitForFunction(
    () => {
      const content = document.querySelector(
        ".message-row.assistant .message-content"
      )?.textContent;
      const streaming = document.querySelector(".streaming-label");
      return Boolean(
        content &&
          content.trim() &&
          content.trim() !== "正在检索手册并整理依据..." &&
          !streaming
      );
    },
    undefined,
    { timeout: 60000 }
  );

  const answer = await page
    .locator(".message-row.assistant .message-content")
    .last()
    .textContent();
  console.log(`Live chat answer: ${answer?.trim()}`);
} finally {
  await electronApp.close();
}
