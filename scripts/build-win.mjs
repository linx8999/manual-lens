import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const electronMirror =
  "https://gh-proxy.com/https://github.com/electron/electron/releases/download/";
const electronVersion = JSON.parse(
  readFileSync(join(process.cwd(), "node_modules", "electron", "package.json"), "utf8")
).version;
const cacheRoot = join(process.env.LOCALAPPDATA || "", "electron", "Cache");
const directArchive = join(cacheRoot, `electron-v${electronVersion}-win32-x64.zip`);
const downloadUrl = `${electronMirror}v${electronVersion}/`;
const cacheDirectory = createHash("sha256").update(downloadUrl).digest("hex");
const hashedArchive = join(
  cacheRoot,
  cacheDirectory,
  `electron-v${electronVersion}-win32-x64.zip`
);

if (existsSync(directArchive) && !existsSync(hashedArchive)) {
  mkdirSync(join(cacheRoot, cacheDirectory), { recursive: true });
  copyFileSync(directArchive, hashedArchive);
}

const builderCli = join(
  process.cwd(),
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js"
);
const result = spawnSync(process.execPath, [builderCli, "--win", "nsis"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    electron_config_cache: cacheRoot,
    ELECTRON_CACHE: cacheRoot,
    ELECTRON_MIRROR: electronMirror,
    ELECTRON_BUILDER_BINARIES_MIRROR:
      "https://npmmirror.com/mirrors/electron-builder-binaries/"
  }
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
