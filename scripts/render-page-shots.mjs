import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const outputDir = resolve("artifacts", "image-match");
const libraryDir = resolve("resources", "library");
const plans = [
  { file: "STM32F10xxx参考手册（中文）.pdf", count: 16, pageCount: 755 },
  { file: "STM32F103xx固件函数库用户手册.pdf", count: 11, pageCount: 368 },
  { file: "Cortex-M3权威指南.pdf", count: 9, pageCount: 322 },
  { file: "STM32F10xxx Cortex-M3编程手册.pdf", count: 7, pageCount: 156 },
  { file: "STM32F103x8B数据手册（中文）.pdf", count: 4, pageCount: 62 },
  { file: "STM32F10xxx闪存编程参考手册（中文）.pdf", count: 3, pageCount: 22 }
];

const TOP_RATIOS = [0.12, 0.24, 0.36];
const HEIGHT_RATIOS = [0.45, 0.58];

// Spread pages across each manual and vary the crop so the suite is not
// measuring one fixed framing.
const samples = [];
let sampleIndex = 0;
for (const plan of plans) {
  for (let index = 0; index < plan.count; index += 1) {
    const pageNumber = Math.max(
      2,
      Math.min(plan.pageCount - 1, Math.round(((index + 1) * plan.pageCount) / (plan.count + 1)))
    );
    samples.push({
      file: plan.file,
      pageNumber,
      topRatio: TOP_RATIOS[sampleIndex % TOP_RATIOS.length],
      heightRatio: HEIGHT_RATIOS[sampleIndex % HEIGHT_RATIOS.length],
      downscale: sampleIndex % 2 === 0 ? 0.55 : 1
    });
    sampleIndex += 1;
  }
}

await mkdir(outputDir, { recursive: true });

const roots = { "/library/": libraryDir, "/node_modules/": resolve("node_modules") };
const mime = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf"
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const entry = Object.entries(roots).find(([prefix]) => pathname.startsWith(prefix));
  if (!entry) {
    response.writeHead(404).end("not found");
    return;
  }
  const [prefix, root] = entry;
  const filePath = join(root, pathname.slice(prefix.length));
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mime[extname(filePath)] ?? "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});

await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const { port } = server.address();

const browser = await chromium.launch({ executablePath: findChromium() });
const manifest = [];

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.goto(`http://127.0.0.1:${port}/library/`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page.setContent(`<!doctype html><html><body><canvas id="c"></canvas></body></html>`);
  await page.addScriptTag({
    type: "module",
    content: `
      import * as pdfjs from "/node_modules/pdfjs-dist/build/pdf.mjs";
      pdfjs.GlobalWorkerOptions.workerSrc =
        "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
      globalThis.pdfjs = pdfjs;
      globalThis.ready = true;
    `
  });
  await page.waitForFunction(() => globalThis.ready === true, undefined, { timeout: 30000 });

  for (const sample of samples) {
    const source = join(libraryDir, sample.file);
    if (!existsSync(source)) {
      console.log("skip (missing):", sample.file);
      continue;
    }
    const data = (await readFile(source)).toString("base64");
    const pageNumber = sample.pageNumber;

    const shot = await page.evaluate(
        async ({ data, pageNumber, topRatio, heightRatio, downscale }) => {
          const pdfjs = globalThis.pdfjs;
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          const pdfDocument = await pdfjs.getDocument({ data: bytes, cMapPacked: true }).promise;
          const pdfPage = await pdfDocument.getPage(pageNumber);
          const viewport = pdfPage.getViewport({ scale: 1.7 });
          const canvas = document.getElementById("c");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await pdfPage.render({ canvasContext: context, viewport }).promise;

          const cropTop = Math.floor(canvas.height * topRatio);
          const cropHeight = Math.floor(canvas.height * heightRatio);
          const crop = document.createElement("canvas");
          crop.width = canvas.width;
          crop.height = cropHeight;
          crop.getContext("2d").drawImage(
            canvas,
            0,
            cropTop,
            canvas.width,
            cropHeight,
            0,
            0,
            canvas.width,
            cropHeight
          );

          let output = crop;
          if (downscale < 1) {
            const small = document.createElement("canvas");
            small.width = Math.max(1, Math.round(crop.width * downscale));
            small.height = Math.max(1, Math.round(crop.height * downscale));
            small.getContext("2d").drawImage(crop, 0, 0, small.width, small.height);
            const restored = document.createElement("canvas");
            restored.width = crop.width;
            restored.height = crop.height;
            restored.getContext("2d").drawImage(small, 0, 0, restored.width, restored.height);
            output = restored;
          }

          const url = output.toDataURL("image/png");
          await pdfDocument.cleanup?.();
          return { url, width: output.width, height: output.height };
        },
        {
          data,
          pageNumber,
          topRatio: sample.topRatio,
          heightRatio: sample.heightRatio,
          downscale: sample.downscale
        }
      );

    const fileName = `${sample.file.replace(/\.pdf$/i, "")}__p${pageNumber}.png`;
    await writeFile(
      join(outputDir, fileName),
      Buffer.from(shot.url.split(",")[1], "base64")
    );
    manifest.push({
      file: fileName,
      pdf: sample.file,
      pageNumber,
      topRatio: sample.topRatio,
      heightRatio: sample.heightRatio,
      downscale: sample.downscale,
      width: shot.width,
      height: shot.height
    });
    console.log("rendered", fileName);
  }
} finally {
  await browser.close();
  server.close();
}

await writeFile(
  join(outputDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  "utf8"
);
console.log("total shots:", manifest.length);

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
