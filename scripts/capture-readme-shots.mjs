import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const rendererRoot = resolve("out", "renderer");
const outputDir = resolve("artifacts", "readme");
await mkdir(outputDir, { recursive: true });

// 演示用附件：优先用真实手册截图（放在 artifacts 下，不随仓库发布），
// 没有时回退到应用图标。
const attachedShotPath = existsSync(resolve(outputDir, "attached-shot.png"))
  ? resolve(outputDir, "attached-shot.png")
  : resolve("resources", "icon-1024.png");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const fromLibrary = pathname.startsWith("/library/");
  const root = fromLibrary ? resolve("resources", "library") : rendererRoot;
  const filePath = fromLibrary
    ? join(root, pathname.slice("/library/".length))
    : join(root, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mime[extname(filePath)] ?? "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const { port } = server.address();

const browser = await chromium.launch({ executablePath: findChromium() });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(stubApi);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.locator(".sidebar").waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);

  const theme = async (name) => {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, name);
    await page.waitForTimeout(200);
  };

  // 亮色为主：白 / 蓝白 各一张主界面
  for (const [name, file] of [
    ["white", "theme-white"],
    ["blue", "theme-blue"],
    ["obsidian", "theme-obsidian"]
  ]) {
    await theme(name);
    await page.screenshot({ path: join(outputDir, `${file}.png`) });
  }

  // 资料库勾选 + 搜索框（白主题）
  await theme("white");
  await page.getByTitle("知识库管理").click();
  await page.locator(".library-modal").waitFor();
  await page.locator(".library-modal .document-search input").fill("参考");
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "document-scope.png") });
  await page.locator(".library-modal").getByTitle("关闭").click();

  // 会话 + 页级引用（蓝白）
  await theme("blue");
  await page.locator(".list-main").first().click();
  await page.locator(".citation-card").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "answer-and-citations.png") });

  // 附加截图 + 查找对应页面 + 相似值结果（蓝白）
  await page
    .locator('.composer input[type="file"]')
    .setInputFiles({
      name: "manual-shot.png",
      mimeType: "image/png",
      buffer: await readFile(attachedShotPath)
    });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "查找对应页面" }).click();
  await page.locator(".image-match-item").first().waitFor({ timeout: 20000 });
  // 命中后阅读器会自动打开对应页：等它渲染完，先给正文打码再截图
  await page.locator(".pdf-page-surface canvas").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.addStyleTag({
    content:
      ".pdf-page-surface canvas, .pdf-page-surface .textLayer { filter: blur(7px); }"
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "image-locate.png") });

  // 阅读器打开真实手册页：渲染真页，正文打模糊以规避版权问题
  await page.locator(".attach-preview .row-action").click();
  await theme("white");
  await page.getByTitle("STM32F10xxx参考手册（中文）.pdf").click();
  await page.locator(".pdf-page-surface canvas").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator(".page-input input").fill("40");
  await page.waitForTimeout(1500);
  await page.addStyleTag({
    content:
      ".pdf-page-surface canvas, .pdf-page-surface .textLayer { filter: blur(7px); }"
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "reader-document.png") });

  // 设置页（白主题）
  await theme("white");
  await page.getByTitle("API 设置").click();
  await page.locator(".settings-modal").waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outputDir, "settings.png") });
} finally {
  await browser.close();
  server.close();
}

function findChromium() {
  const cache = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null;
  if (!cache) return undefined;
  const candidates = ["1234", "1228", "1236"].map((build) =>
    join(cache, `chromium-${build}`, "chrome-win64", "chrome.exe")
  );
  return candidates.find((candidate) => existsSync(candidate));
}

function stubApi() {
  const documents = [
    { id: "doc-reference", title: "STM32F10xxx参考手册（中文）", originalFilename: "STM32F10xxx参考手册（中文）.pdf", kind: "pdf", pageCount: 755, indexedChunkCount: 5821, indexCoverage: "content", status: "ready", sha256: "a", errorMessage: null, createdAt: 1, updatedAt: 2 },
    { id: "doc-firmware", title: "STM32F103xx固件函数库用户手册", originalFilename: "STM32F103xx固件函数库用户手册.pdf", kind: "pdf", pageCount: 368, indexedChunkCount: 2140, indexCoverage: "content", status: "ready", sha256: "b", errorMessage: null, createdAt: 1, updatedAt: 2 },
    { id: "doc-cortex", title: "Cortex-M3权威指南", originalFilename: "Cortex-M3权威指南.pdf", kind: "pdf", pageCount: 322, indexedChunkCount: 1900, indexCoverage: "content", status: "ready", sha256: "c", errorMessage: null, createdAt: 1, updatedAt: 2 },
    { id: "doc-pin", title: "STM32F103C8T6引脚定义", originalFilename: "STM32F103C8T6引脚定义.xlsx", kind: "xlsx", pageCount: 3, indexedChunkCount: 96, indexCoverage: "content", status: "ready", sha256: "d", errorMessage: null, createdAt: 1, updatedAt: 2 }
  ];
  const conversations = [
    { id: "c1", title: "PA9 与 USART1 引脚复用", createdAt: 1, updatedAt: 3, messageCount: 4 },
    { id: "c2", title: "低功耗模式有哪几种", createdAt: 1, updatedAt: 2, messageCount: 2 }
  ];
  const settings = {
    chatBaseUrl: "https://api.example.com/v1",
    chatModel: "your-chat-model",
    embeddingBaseUrl: "https://api.example.com/v1",
    embeddingModel: "your-embedding-model",
    chatApiKeyConfigured: true,
    embeddingApiKeyConfigured: true,
    requestTimeoutMs: 60000,
    theme: "white",
    imageEngine: "vision"
  };
  const citation = (sourceId, documentId, documentTitle, pageNumber, heading, excerpt) => ({
    sourceId, documentId, documentTitle, chunkId: "k" + sourceId, pageNumber,
    printedPage: String(pageNumber), heading, excerpt, score: 0.9
  });

  window.stm32 = {
    app: {
      getInfo: async () => ({ name: "ManualLens", version: "0.2.5" }),
      getPaths: async () => ({ dataRoot: "我的文档\\STM32RAG知识库", library: "", index: "", cache: "", logs: "", backups: "" })
    },
    knowledge: { chooseLocation: async () => null, changeLocation: async () => ({ dataRoot: "", restarting: false }) },
    settings: {
      get: async () => settings,
      save: async (input) => Object.assign(settings, input),
      testChat: async () => ({ ok: true, message: "" }),
      testEmbedding: async () => ({ ok: true, message: "" }),
      listModels: async () => ({ models: ["your-chat-model"] })
    },
    documents: {
      list: async () => documents,
      importDialog: async () => [],
      importPaths: async () => [],
      remove: async () => undefined,
      toc: async () => [],
      asset: async (documentId) => {
        if (documentId !== "doc-reference") {
          return { kind: "pdf" };
        }
        const response = await fetch("/library/STM32F10xxx参考手册（中文）.pdf");
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
          { id: "m1", conversationId, role: "user", content: "PA9 怎么配置成 USART1_TX？", status: "complete", citations: [], createdAt: 1 },
          {
            id: "m2", conversationId, role: "assistant", status: "complete", createdAt: 2,
            content: "PA9 默认复用为 USART1_TX。先开启 GPIOA 与 USART1 时钟，把 PA9 配成复用推挽输出，再设置波特率并开启发送。\n\n关键寄存器：`GPIOA_CRH`、`USART1_BRR`、`USART1_CR1`。",
            citations: [
              citation("S1", "doc-reference", "STM32F10xxx参考手册（中文）", 120, "8.3.11 SPI3复用功能重映射", "USART1_REMAP 与 AFIO_MAPR 的重映射位定义，PA9 作为 USART1_TX 的复用配置。"),
              citation("S2", "doc-pin", "STM32F103C8T6引脚定义", 1, "Sheet1", "PA9 USART1_TX/TIM1_CH2，复用推挽输出。")
            ]
          }
        ]
      }),
      delete: async () => undefined
    },
    chat: { ask: async () => { throw new Error("演示模式"); }, onEvent: () => () => undefined },
    images: {
      match: async () => ({
        matched: true,
        confidence: 0.96,
        ocrText: "4.3 低功耗模式 睡眠模式 停止模式 待机模式",
        candidates: [
          { documentId: "doc-reference", documentTitle: "STM32F10xxx参考手册（中文）", pageNumber: 40, printedPage: "40", heading: "4.3 低功耗模式", score: 0.96, excerpt: "4.3 低功耗模式：睡眠模式、停止模式、待机模式。" },
          { documentId: "doc-firmware", documentTitle: "STM32F103xx固件函数库用户手册", pageNumber: 191, printedPage: "191", heading: "PWR_EnterSTANDBYMode", score: 0.72, excerpt: "PWR 低功耗模式相关函数。" },
          { documentId: "doc-cortex", documentTitle: "Cortex-M3权威指南", pageNumber: 89, printedPage: "89", heading: "系统控制", score: 0.41, excerpt: "系统控制寄存器与低功耗。" }
        ],
        warnings: []
      })
    },
    embeddings: {
      status: async () => ({ configured: true, model: "your-embedding-model", indexed: 9000, total: 9000, staged: 0, complete: true, indexedAt: 1 }),
      rebuild: async () => ({ configured: true, model: "your-embedding-model", indexed: 9000, total: 9000, staged: 0, complete: true, indexedAt: 1 }),
      onProgress: () => () => undefined
    }
  };
}
