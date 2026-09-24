import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const THEMES = ["blue", "white", "obsidian"];
const rendererRoot = resolve("out", "renderer");
const libraryRoot = resolve("resources", "library");
const outputDir = resolve("artifacts", "themes");

await mkdir(outputDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const fromLibrary = pathname.startsWith("/library/");
  const allowedRoot = fromLibrary ? libraryRoot : rendererRoot;
  const filePath = fromLibrary
    ? join(libraryRoot, pathname.slice("/library/".length))
    : join(rendererRoot, pathname === "/" ? "index.html" : pathname);

  if (!filePath.startsWith(allowedRoot)) {
    response.writeHead(403).end("forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});

await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const { port } = server.address();

const browser = await chromium.launch({ executablePath: findChromium() });

function findChromium() {
  const cache = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ms-playwright")
    : null;
  if (!cache) {
    return undefined;
  }
  const candidates = ["1234", "1228", "1236"].map((build) =>
    join(cache, `chromium-${build}`, "chrome-win64", "chrome.exe")
  );
  return candidates.find((candidate) => existsSync(candidate));
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(stubDesktopApi);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.locator(".sidebar").waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);

  for (const theme of THEMES) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outputDir, `${theme}-main.png`) });
    console.log(`${theme}:`, JSON.stringify(await page.evaluate(collectContrast)));
  }

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "obsidian";
  });
  await page.locator(".composer textarea").click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(outputDir, "obsidian-composer-focus.png") });
  const emptyComposer = await page.locator(".composer textarea").evaluate((element) => ({
    height: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    boxShadow: getComputedStyle(element).boxShadow
  }));

  await page
    .locator(".composer textarea")
    .fill(
      Array.from(
        { length: 14 },
        (_, index) => `第 ${index + 1} 行：验证输入框自动增高与最大高度限制。`
      ).join("\n")
    );
  await page.waitForTimeout(150);
  const longComposer = await page.locator(".composer textarea").evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY
  }));
  await page.screenshot({ path: join(outputDir, "obsidian-composer-long.png") });
  console.log("composer:", JSON.stringify({ emptyComposer, longComposer }));
  await page.locator(".composer textarea").fill("");

  await page.locator(".list-main").first().click();
  await page.locator(".citation-card").first().waitFor({ timeout: 20000 });
  for (const theme of ["blue", "obsidian"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outputDir, `${theme}-conversation.png`) });
  }
  console.log("conversation:", JSON.stringify(await page.evaluate(collectContrast)));

  await page.getByTitle("知识库管理").click();
  await page.locator(".library-modal").waitFor();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "obsidian";
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outputDir, "obsidian-library.png") });
  await page.locator(".library-modal").getByTitle("关闭").click();

  await page.getByTitle("API 设置").click();
  await page.locator(".settings-modal").waitFor();
  for (const theme of ["obsidian", "white"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outputDir, `${theme}-settings.png`) });
  }

  await page.locator(".settings-modal").getByTitle("关闭").click();

  // The repository does not ship manuals, so the reader check only runs when a
  // local sample PDF is available.
  const readerFixture = join(
    "resources",
    "library",
    "STM32F10xxx闪存编程参考手册（中文）.pdf"
  );
  if (existsSync(readerFixture)) {
    await page.getByTitle("STM32F10xxx闪存编程参考手册（中文）.pdf").click();
    await page.locator(".pdf-page-surface canvas").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
    await page.locator(".page-input input").fill("8");
    await page.waitForTimeout(700);
    const beforeResize = await page.evaluate(readReaderViewport);

    const splitter = page.getByRole("separator", { name: "调整原件阅读器宽度" });
    const splitterBox = await splitter.boundingBox();
    if (!splitterBox) {
      throw new Error("reader splitter not found");
    }
    await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 120);
    await page.mouse.down();
    await page.mouse.move(splitterBox.x - 150, splitterBox.y + 120, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const afterResize = await page.evaluate(readReaderViewport);
    console.log("reader-resize:", JSON.stringify({ beforeResize, afterResize }));
    await page.screenshot({ path: join(outputDir, "obsidian-reader-resized.png") });
  } else {
    console.log("reader-resize: skipped (no local sample PDF)");
  }
} finally {
  await browser.close();
  server.close();
}

function stubDesktopApi() {
  const documents = [
    {
      id: "doc-reference",
      title: "STM32F10xxx参考手册（中文）",
      originalFilename: "STM32F10xxx参考手册（中文）.pdf",
      kind: "pdf",
      pageCount: 755,
      indexedChunkCount: 5821,
      indexCoverage: "content",
      status: "ready",
      sha256: "reference",
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2
    },
    {
      id: "doc-cortex",
      title: "Cortex-M3权威指南",
      originalFilename: "Cortex-M3权威指南.pdf",
      kind: "pdf",
      pageCount: 442,
      indexedChunkCount: 2140,
      indexCoverage: "content",
      status: "ready",
      sha256: "cortex",
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2
    },
    {
      id: "doc-pin",
      title: "STM32F103C8T6引脚定义",
      originalFilename: "STM32F103C8T6引脚定义.xlsx",
      kind: "xlsx",
      pageCount: 3,
      indexedChunkCount: 96,
      indexCoverage: "content",
      status: "ready",
      sha256: "pin",
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2
    },
    {
      id: "doc-flash",
      title: "STM32F10xxx闪存编程参考手册（中文）",
      originalFilename: "STM32F10xxx闪存编程参考手册（中文）.pdf",
      kind: "pdf",
      pageCount: 22,
      indexedChunkCount: 240,
      indexCoverage: "content",
      status: "ready",
      sha256: "flash",
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2
    }
  ];
  const conversations = [
    { id: "c1", title: "PA9 与 USART1 引脚复用", createdAt: 1, updatedAt: 3, messageCount: 4 },
    { id: "c2", title: "TIM2 定时器分频配置", createdAt: 1, updatedAt: 2, messageCount: 6 }
  ];
  const settings = {
    chatBaseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4.1-mini",
    embeddingBaseUrl: "https://api.openai.com/v1",
    embeddingModel: "text-embedding-3-small",
    chatApiKeyConfigured: false,
    embeddingApiKeyConfigured: false,
    requestTimeoutMs: 60000,
    theme: "blue"
  };
  const embeddingStatus = {
    configured: false,
    model: "",
    indexed: 0,
    total: 0,
    staged: 0,
    complete: false,
    indexedAt: null
  };

  window.stm32 = {
    app: {
      getInfo: async () => ({ name: "STM32 手册智能体", version: "0.2.0" }),
      getPaths: async () => ({
        dataRoot: "我的文档\\STM32RAG知识库",
        library: "",
        index: "",
        cache: "",
        logs: "",
        backups: ""
      })
    },
    knowledge: {
      chooseLocation: async () => null,
      changeLocation: async () => ({ dataRoot: "", restarting: false })
    },
    settings: {
      get: async () => settings,
      save: async (input) => Object.assign(settings, input),
      testChat: async () => ({ ok: true, message: "" }),
      testEmbedding: async () => ({ ok: true, message: "" }),
      listModels: async () => ({ models: [] })
    },
    documents: {
      list: async () => documents,
      importDialog: async () => [],
      importPaths: async () => [],
      remove: async () => undefined,
      toc: async () => [],
      asset: async (documentId) => {
        if (documentId !== "doc-flash") {
          return { kind: "pdf" };
        }
        const response = await fetch(
          "/library/STM32F10xxx闪存编程参考手册（中文）.pdf"
        );
        return { kind: "pdf", bytes: new Uint8Array(await response.arrayBuffer()) };
      }
    },
    importJobs: { onProgress: () => () => undefined },
    conversations: {
      list: async () => conversations,
      get: async (conversationId) => ({
        id: conversationId,
        title: "PA9 与 USART1 引脚复用",
        messages: [
          {
            id: "m1",
            conversationId,
            role: "user",
            content: "PA9 怎么配置成 USART1_TX？",
            status: "complete",
            citations: [],
            createdAt: 1
          },
          {
            id: "m2",
            conversationId,
            role: "assistant",
            status: "complete",
            createdAt: 2,
            content:
              "PA9 默认复用为 USART1_TX。先开启 GPIOA 与 USART1 时钟，把 PA9 配成复用推挽输出，再设置波特率并开启发送。\n\n关键寄存器：`GPIOA_CRH`、`USART1_BRR`、`USART1_CR1`。",
            citations: [
              {
                sourceId: "s1",
                documentId: "doc-reference",
                documentTitle: "STM32F10xxx参考手册（中文）",
                chunkId: "k1",
                pageNumber: 120,
                printedPage: "110",
                heading: "USART 引脚复用",
                excerpt: "PA9 可用作 USART1_TX，需要在 GPIOA_CRH 中配置复用推挽输出。",
                score: 0.92
              },
              {
                sourceId: "s2",
                documentId: "doc-cortex",
                documentTitle: "Cortex-M3权威指南",
                chunkId: "k2",
                pageNumber: 88,
                printedPage: "74",
                heading: "GPIO 复用",
                excerpt: "复用推挽输出适合驱动 USART 等片上外设信号。",
                score: 0.81
              }
            ]
          }
        ]
      }),
      delete: async () => undefined
    },
    chat: {
      ask: async () => {
        throw new Error("尚未配置聊天 API，请在设置中填写 Key。");
      },
      onEvent: () => () => undefined
    },
    embeddings: {
      status: async () => embeddingStatus,
      rebuild: async () => embeddingStatus,
      onProgress: () => () => undefined
    }
  };
}

function collectContrast() {
  const selectors = [
    ".sidebar",
    ".chat-pane",
    ".reader-pane",
    ".status-pill",
    ".citation-card",
    ".composer"
  ];

  function parseColor(value) {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) {
      return null;
    }
    const parts = match[1].split(",").map((part) => Number.parseFloat(part));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }

  function backgroundOf(element) {
    let node = element;
    while (node) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0.5) {
        return color;
      }
      node = node.parentElement;
    }
    return parseColor(getComputedStyle(document.body).backgroundColor);
  }

  function luminance({ r, g, b }) {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  const report = {};
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) {
      report[selector] = null;
      continue;
    }
    const foreground = parseColor(getComputedStyle(element).color);
    const background = backgroundOf(element);
    if (!foreground || !background) {
      report[selector] = null;
      continue;
    }
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    report[selector] = Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
  }
  return report;
}

function readReaderViewport() {
  const element = document.querySelector(".pdf-continuous-scroll");
  if (!element) {
    return null;
  }
  const viewportTop = element.getBoundingClientRect().top;
  const slots = Array.from(element.querySelectorAll("[data-page-number]"));
  const firstVisible = slots.find((slot) => slot.getBoundingClientRect().bottom > viewportTop + 1);
  if (!firstVisible) {
    return { page: null, ratio: null, scrollTop: Math.round(element.scrollTop) };
  }
  const rect = firstVisible.getBoundingClientRect();
  return {
    page: Number(firstVisible.dataset.pageNumber),
    ratio: Number(((viewportTop - rect.top) / rect.height).toFixed(3)),
    scrollTop: Math.round(element.scrollTop),
    scrollHeight: Math.round(element.scrollHeight)
  };
}
