import { app, BrowserWindow, nativeImage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

async function main() {
  const resources = resolve("resources");
  const svg = await readFile(join(resources, "icon-source.svg"), "utf8");
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { width: 1024px; height: 1024px; margin: 0; overflow: hidden; background: transparent; }
      svg { display: block; width: 1024px; height: 1024px; }
    </style>
  </head>
  <body>${svg}</body>
</html>`;

  await app.whenReady();
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true
    }
  });

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  const source = await window.webContents.capturePage({
    x: 0,
    y: 0,
    width: 1024,
    height: 1024
  });

  const sourcePng = source.toPNG();
  const sourceImage = nativeImage.createFromBuffer(sourcePng);
  const outputDir = join(resources, "icons");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(resources, "icon-1024.png"), sourcePng);
  await writeFile(
    join(resources, "icon.png"),
    sourceImage.resize({ width: 256, height: 256, quality: "best" }).toPNG()
  );

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngEntries = sizes.map((size) => ({
    size,
    bytes: sourceImage.resize({ width: size, height: size, quality: "best" }).toPNG()
  }));
  for (const entry of pngEntries) {
    await writeFile(join(outputDir, `${entry.size}x${entry.size}.png`), entry.bytes);
  }
  await writeFile(join(resources, "icon.ico"), createIco(pngEntries));
  window.destroy();
  app.exit(0);
}

main().catch((error) => {
  console.error(error);
  setTimeout(() => app.exit(1), 500);
});

function createIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;
  entries.forEach((entry, index) => {
    const start = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, start);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, start + 1);
    directory.writeUInt8(0, start + 2);
    directory.writeUInt8(0, start + 3);
    directory.writeUInt16LE(1, start + 4);
    directory.writeUInt16LE(32, start + 6);
    directory.writeUInt32LE(entry.bytes.length, start + 8);
    directory.writeUInt32LE(offset, start + 12);
    offset += entry.bytes.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.bytes)]);
}
