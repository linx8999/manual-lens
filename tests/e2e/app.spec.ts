import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { AppDatabase } from "../../src/main/storage/database";

const manifestPath = resolve("resources", "library-manifest.json");
const hasCorpus =
  existsSync(manifestPath) &&
  (JSON.parse(await readFile(manifestPath, "utf8")) as Array<{ sourcePath: string }>).some(
    (item) => existsSync(resolve(item.sourcePath))
  );

test.skip(
  !hasCorpus,
  "需要本地手册语料（resources/library）才能运行端到端用例"
);

test("launches, imports manuals, answers without API, and opens a cited page", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "stm32-rag-e2e-"));
  const seedDatabase = await AppDatabase.open(dataRoot);
  for (let index = 0; index < 15; index += 1) {
    seedDatabase.run(
      `INSERT INTO conversations (id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      `seed-conversation-${index}`,
      `历史会话 ${index + 1}`,
      index + 1,
      index + 1
    );
  }
  seedDatabase.close();
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
    await expect(page.getByText("STM32 手册智能体").first()).toBeVisible();
    await expect(page.getByText("STM32F10xxx参考手册（中文）")).toBeVisible({
      timeout: 60000
    });
    await page.getByRole("button", { name: "知识库管理" }).click();
    const libraryModal = page.locator(".library-modal");
    await expect(libraryModal.getByText("资料库存放地址")).toBeVisible();
    await expect(libraryModal.getByText(dataRoot, { exact: true })).toBeVisible();
    await expect(
      libraryModal.getByRole("button", { name: "设置存放位置" })
    ).toBeVisible();
    await libraryModal.getByRole("button", { name: "关闭" }).click();

    const sidebarLayout = await page.locator(".sidebar").evaluate((sidebar) => {
      const conversations = sidebar.querySelector(".conversation-section");
      const documents = sidebar.querySelector(".documents-section");
      const conversationList = conversations?.querySelector(".list-stack");
      if (!conversations || !documents || !conversationList) {
        throw new Error("Sidebar layout is incomplete.");
      }
      return {
        conversationBottom: conversations.getBoundingClientRect().bottom,
        documentsTop: documents.getBoundingClientRect().top,
        conversationScrollable: conversationList.scrollHeight > conversationList.clientHeight
      };
    });
    expect(sidebarLayout.conversationBottom).toBeLessThanOrEqual(
      sidebarLayout.documentsTop + 1
    );
    expect(sidebarLayout.conversationScrollable).toBe(true);

    await page.getByRole("button", { name: "PA9 怎么配置成 USART1_TX？" }).click();
    await expect(page.getByText(/尚未配置聊天 API/)).toBeVisible();
    await expect(page.getByLabel("引用来源")).toBeVisible();
    await expect(page.locator(".pdf-page-surface canvas").first()).toBeVisible({
      timeout: 30000
    });
    await page.waitForFunction(() => (document.querySelector("canvas")?.width ?? 0) > 300);

    const pageCaption = page.locator(".reader-page-caption");
    await expect(pageCaption).toContainText("第 120 页 / 共 755 页");
    await expect(page.locator(".reader-citation-context")).toHaveCount(0);
    const captionBox = await pageCaption.boundingBox();
    const continuousViewportBox = await page
      .locator(".pdf-continuous-scroll")
      .boundingBox();
    if (!captionBox || !continuousViewportBox) {
      throw new Error("Reader page caption layout is unavailable.");
    }
    expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(
      continuousViewportBox.y + 1
    );

    await expect(page.locator(".citation-hit").first()).toBeAttached();
    await page.getByRole("button", { name: "隐藏引用高亮" }).click();
    await expect(page.locator(".citation-hit")).toHaveCount(0);

    const pageInput = page.locator(".page-input input");
    await expect(pageInput).toHaveValue("120");
    const continuousScroll = page.locator(".pdf-continuous-scroll");
    await expect(continuousScroll).toBeVisible();
    await continuousScroll.hover();
    await page.mouse.wheel(0, 1400);
    await expect
      .poll(async () => Number(await pageInput.inputValue()))
      .toBeGreaterThan(120);
    await expect(page.locator(".pdf-page-surface").first()).toBeVisible();

    const reader = page.locator(".reader-pane");
    const splitter = page.getByRole("separator", { name: "调整原件阅读器宽度" });
    const readerBefore = await reader.boundingBox();
    const canvasBefore = await page
      .locator(".pdf-page-surface canvas")
      .first()
      .evaluate((canvas) => (canvas as HTMLCanvasElement).width);
    const splitterBox = await splitter.boundingBox();
    if (!readerBefore || !splitterBox) {
      throw new Error("Reader resize handle is unavailable.");
    }
    await page.mouse.move(
      splitterBox.x + splitterBox.width / 2,
      splitterBox.y + splitterBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      splitterBox.x - 60,
      splitterBox.y + splitterBox.height / 2,
      { steps: 6 }
    );
    // Mid-drag: the pane already follows the pointer...
    await expect
      .poll(async () => (await reader.boundingBox())?.width ?? 0)
      .toBeGreaterThan(readerBefore.width);
    // ...while the page raster stays frozen until the pointer is released.
    expect(
      await page
        .locator(".pdf-page-surface canvas")
        .first()
        .evaluate((canvas) => (canvas as HTMLCanvasElement).width)
    ).toBe(canvasBefore);
    await page.mouse.move(splitterBox.x - 120, splitterBox.y + splitterBox.height / 2, {
      steps: 8
    });
    await page.mouse.up();
    await expect
      .poll(async () => (await reader.boundingBox())?.width ?? 0)
      .toBeGreaterThan(readerBefore.width + 80);
    await expect
      .poll(async () =>
        page
          .locator(".pdf-page-surface canvas")
          .first()
          .evaluate((canvas) => (canvas as HTMLCanvasElement).width)
      )
      .toBeGreaterThan(canvasBefore);

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1100, 720);
    });
    await page.getByRole("button", { name: "API 设置" }).click();
    const settingsLayout = await page.locator(".settings-modal").evaluate((modal) => {
      const grid = modal.querySelector(".settings-grid");
      const footer = modal.querySelector(".modal-footer");
      if (!grid || !footer) {
        throw new Error("Settings layout is incomplete.");
      }
      const modalRect = modal.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        footerInside: footerRect.bottom <= modalRect.bottom + 1,
        gridScrollable: grid.scrollHeight > grid.clientHeight
      };
    });
    expect(settingsLayout.footerInside).toBe(true);
    expect(settingsLayout.gridScrollable).toBe(true);
    await page.getByRole("button", { name: "曜石黑" }).click();
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "obsidian");
  } finally {
    await electronApp.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});
