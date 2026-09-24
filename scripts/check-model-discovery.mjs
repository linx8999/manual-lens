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
  await page.getByRole("button", { name: "API 设置" }).click();

  const deadline = Date.now() + 65000;
  while (Date.now() < deadline) {
    const models = await page
      .locator("#chat-model-options option")
      .evaluateAll((options) => options.map((option) => option.value));
    if (models.length > 0) {
      console.log(`Discovered chat models: ${models.join(", ")}`);
      process.exitCode = 0;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (process.exitCode !== 0) {
    const message = await page.locator(".dialog-message").textContent().catch(() => null);
    throw new Error(message || "模型列表在超时前没有返回。");
  }
} finally {
  await electronApp.close();
}
