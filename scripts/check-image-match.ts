import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AppDatabase } from "../src/main/storage/database";
import { ImageMatcher } from "../src/main/vision/image-matcher";

interface ManifestEntry {
  file: string;
  pdf: string;
  pageNumber: number;
}

const dataRoot = resolve(process.argv[2] ?? "artifacts/bench-data-v2");
const shotDir = resolve("artifacts", "image-match");
const database = await AppDatabase.open(dataRoot);
const matcher = new ImageMatcher(database);

const documents = database.query<{ id: string; original_filename: string; title: string }>(
  "SELECT id, original_filename, title FROM documents"
);
const byFilename = new Map(documents.map((document) => [document.original_filename, document]));

const manifest = JSON.parse(
  await readFile(join(shotDir, "manifest.json"), "utf8")
) as ManifestEntry[];

// When the vision engine has transcribed the shots, evaluate those instead of
// the local OCR fallback.
let transcriptions: Record<string, string> = {};
try {
  transcriptions = JSON.parse(
    await readFile(join(shotDir, "transcriptions.json"), "utf8")
  ) as Record<string, string>;
} catch {
  transcriptions = {};
}
const visionShots = Object.values(transcriptions).filter((text) => text.length > 0).length;
console.log(
  visionShots > 0
    ? `引擎：视觉模型（已转录 ${visionShots} 张）`
    : "引擎：本机 OCR"
);

let passed = 0;
let total = 0;
let top1 = 0;
let inCandidates = 0;
const started = Date.now();

for (const item of manifest) {
  const expected = byFilename.get(item.pdf);
  if (!expected) {
    console.log(`SKIP ${item.file} (文档不在基准库中)`);
    continue;
  }

  const bytes = new Uint8Array(await readFile(join(shotDir, item.file)));
  const caseStarted = Date.now();
  const visionText = transcriptions[item.file];
  const result = await matcher.match(
    bytes,
    undefined,
    visionText ? async () => visionText : undefined
  );
  const best = result.candidates[0];
  const isTop1 =
    best?.documentId === expected.id && best?.pageNumber === item.pageNumber;
  const isInCandidates = result.candidates.some(
    (candidate) =>
      candidate.documentId === expected.id && candidate.pageNumber === item.pageNumber
  );
  const ok = result.matched && isTop1;

  total += 1;
  if (ok) {
    passed += 1;
  }
  if (isTop1) {
    top1 += 1;
  }
  if (isInCandidates) {
    inCandidates += 1;
  }
  const got = best
    ? `${best.documentTitle} p${best.pageNumber} (${(best.score * 100).toFixed(0)}%)`
    : "无候选";
  console.log(
    `${isInCandidates ? "HIT" : "MISS"} ${isTop1 ? "#1" : "  "} ${item.pdf} p${item.pageNumber} -> ${got} [${Date.now() - caseStarted}ms]`
  );
}

const rate = (value: number): string =>
  total > 0 ? ((value / total) * 100).toFixed(1) : "0";
console.log(
  `\n平均命中率（正确页出现在候选列表中）${inCandidates}/${total} = ${rate(inCandidates)}%` +
    `\n其中排在第一名的 ${top1}/${total} = ${rate(top1)}%` +
    `\n自动打开（第一名且达阈值）${passed}/${total} = ${rate(passed)}%` +
    `  (total ${Math.round((Date.now() - started) / 1000)}s)`
);

database.close();
