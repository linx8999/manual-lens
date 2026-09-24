import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

// Dragging the reader splitter must never re-rasterise the PDF mid-drag: the
// old implementation pushed every pointermove through React state, which made
// the pane re-render and re-render the pdf.js canvas on each frame.
test("drags the reader splitter without re-rasterising mid-drag", async () => {
  test.setTimeout(240000);
  const dataRoot = await mkdtemp(join(tmpdir(), "stm32-rag-resize-"));
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
    const firstDocument = page.locator(".documents-section .document-row").first();
    await expect(firstDocument).toBeVisible({ timeout: 180000 });
    await firstDocument.click();

    const reader = page.locator(".reader-pane");
    const canvas = page.locator(".pdf-page-surface canvas").first();
    await expect(canvas).toBeVisible({ timeout: 120000 });
    await page.waitForFunction(
      () => (document.querySelector("canvas")?.width ?? 0) > 300
    );

    const splitter = page.getByRole("separator", { name: "调整原件阅读器宽度" });
    const readerBefore = await reader.boundingBox();
    const canvasBefore = await canvas.evaluate(
      (element) => (element as HTMLCanvasElement).width
    );
    const splitterBox = await splitter.boundingBox();
    if (!readerBefore || !splitterBox) {
      throw new Error("Reader resize handle is unavailable.");
    }

    await page.mouse.move(
      splitterBox.x + splitterBox.width / 2,
      splitterBox.y + splitterBox.height / 2
    );
    await page.mouse.down();

    // Several intermediate frames: the pane must follow the pointer live.
    for (const offset of [20, 40, 60, 80]) {
      await page.mouse.move(
        splitterBox.x - offset,
        splitterBox.y + splitterBox.height / 2,
        { steps: 4 }
      );
      expect(
        await canvas.evaluate((element) => (element as HTMLCanvasElement).width),
        `canvas must stay frozen while dragging (offset ${offset})`
      ).toBe(canvasBefore);
    }

    await expect
      .poll(async () => (await reader.boundingBox())?.width ?? 0)
      .toBeGreaterThan(readerBefore.width + 40);

    // Frames are previewed with a compositor transform instead of a re-render.
    await expect
      .poll(async () =>
        page
          .locator(".pdf-page-stack")
          .evaluate((stack) => (stack as HTMLElement).style.transform)
      )
      .not.toBe("");

    await page.mouse.up();

    // Exactly one re-raster happens after the pointer is released.
    await expect
      .poll(async () =>
        canvas.evaluate((element) => (element as HTMLCanvasElement).width)
      )
      .toBeGreaterThan(canvasBefore);
    await expect
      .poll(async () =>
        page
          .locator(".pdf-page-stack")
          .evaluate((stack) => (stack as HTMLElement).style.transform)
      )
      .toBe("");
    expect(await page.locator(".pdf-page-surface canvas").first()).toBeVisible();
  } finally {
    await electronApp.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});
