import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { join } from "node:path";
import { _electron as electron } from "playwright";

const outputDir = resolve("artifacts");
await mkdir(outputDir, { recursive: true });
const dataRoot = await mkdtemp(join(tmpdir(), "stm32-rag-capture-"));

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
  await page.getByText("STM32F10xxx参考手册（中文）").waitFor({ timeout: 30000 });
  await page.screenshot({
    path: resolve(outputDir, "ui-initial.png"),
    fullPage: true
  });

  await page.locator(".prompt-examples button").first().click();
  await page.getByText(/尚未配置聊天 API/).waitFor({ timeout: 30000 });
  await page.locator("canvas").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => (document.querySelector("canvas")?.width ?? 0) > 300);
  const canvasStats = await page.locator("canvas").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index + 3] > 0 &&
        (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245)
      ) {
        nonWhite += 1;
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      nonWhite,
      total: pixels.length / 4
    };
  });
  console.log("Canvas stats:", canvasStats);
  await page.screenshot({
    path: resolve(outputDir, "ui-answer.png"),
    fullPage: true
  });

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1100, 720);
  });
  await page.getByRole("button", { name: "API 设置" }).click();
  await page.getByRole("dialog", { name: "设置" }).waitFor();
  await page.getByText("主题颜色").waitFor();
  await page.screenshot({
    path: resolve(outputDir, "ui-settings.png"),
    fullPage: true
  });
} finally {
  await electronApp.close();
  await rm(dataRoot, { recursive: true, force: true });
}
