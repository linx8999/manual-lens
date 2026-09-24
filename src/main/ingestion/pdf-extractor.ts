import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { normalizePageText } from "./chunker";

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface RawOutlineNode {
  title?: string;
  dest?: string | unknown[] | null;
  items?: RawOutlineNode[];
}

export interface PdfTextPosition {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPage {
  pageNumber: number;
  printedPage: string | null;
  text: string;
  width: number;
  height: number;
  positions: PdfTextPosition[];
}

export interface PdfOutlineNode {
  title: string;
  level: number;
  pageNumber: number;
}

export interface PdfExtraction {
  title: string;
  pageCount: number;
  pages: PdfPage[];
  outline: PdfOutlineNode[];
  metadata: Record<string, unknown>;
}

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));

export async function extractPdf(path: string): Promise<PdfExtraction> {
  const data = new Uint8Array(await readFile(path));
  const loadingTask = getDocument({
    data,
    cMapUrl: join(pdfjsRoot, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(pdfjsRoot, "standard_fonts") + "/",
    wasmUrl: join(pdfjsRoot, "wasm") + "/",
    disableFontFace: true,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;

  try {
    const metadata = (await pdf.getMetadata().catch(() => null)) as {
      info?: Record<string, unknown>;
      metadata?: { getAll?: () => Record<string, unknown> };
    } | null;
    const pages: PdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const positionedLines = buildLines(content.items as PdfTextItem[]);
      const text = normalizePageText(positionedLines.map((line) => line.text).join("\n"));
      const positions = positionedLines.flatMap((line) =>
        line.items.map((item) => ({
          text: item.text,
          x: item.x,
          y: line.y,
          width: item.width,
          height: item.height
        }))
      );

      pages.push({
        pageNumber,
        printedPage: extractPrintedPage(text, pageNumber),
        text,
        width: viewport.width,
        height: viewport.height,
        positions
      });
    }

    const outline = await extractOutline(pdf);
    const title =
      stringOrNull(metadata?.info?.Title) ??
      stringOrNull(metadata?.metadata?.getAll?.().dc_title) ??
      `PDF 手册 ${pdf.numPages} 页`;

    return {
      title,
      pageCount: pdf.numPages,
      pages,
      outline,
      metadata: metadata?.info ?? {}
    };
  } finally {
    await loadingTask.destroy();
  }
}

function buildLines(items: PdfTextItem[]): Array<{
  text: string;
  y: number;
  items: Array<{ text: string; x: number; width: number; height: number }>;
}> {
  const lines = new Map<number, Array<Required<PdfTextItem>>>();

  for (const item of items) {
    if (!item.str || !item.transform) {
      continue;
    }
    const y = roundTo(item.transform[5] ?? 0, 1);
    const existing = lines.get(y) ?? [];
    existing.push(item as Required<PdfTextItem>);
    lines.set(y, existing);
  }

  return [...lines.entries()]
    .sort(([left], [right]) => right - left)
    .map(([y, lineItems]) => {
      const sorted = [...lineItems].sort(
        (left, right) => (left.transform[4] ?? 0) - (right.transform[4] ?? 0)
      );
      let text = "";
      const positionedItems: Array<{ text: string; x: number; width: number; height: number }> = [];

      for (const item of sorted) {
        text = appendText(text, item.str);
        positionedItems.push({
          text: item.str,
          x: item.transform[4] ?? 0,
          width: item.width ?? 0,
          height: Math.abs(item.transform[3] ?? item.height ?? 0)
        });
      }

      return { text: text.trim(), y, items: positionedItems };
    })
    .filter((line) => line.text.length > 0);
}

function appendText(current: string, next: string): string {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }

  const previous = current.at(-1) ?? "";
  const first = next.at(0) ?? "";
  const needsSpace = /[A-Za-z0-9)]/.test(previous) && /[A-Za-z0-9(]/.test(first);
  return `${current}${needsSpace ? " " : ""}${next}`;
}

async function extractOutline(pdf: {
  getOutline(): Promise<RawOutlineNode[] | null>;
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}): Promise<PdfOutlineNode[]> {
  const outline = await pdf.getOutline();
  if (!outline) {
    return [];
  }

  const result: PdfOutlineNode[] = [];

  async function visit(nodes: RawOutlineNode[], level: number): Promise<void> {
    for (const node of nodes) {
      const title = node.title?.trim();
      const pageNumber = await resolveOutlinePage(pdf, node.dest);

      if (title && pageNumber) {
        result.push({ title, level, pageNumber });
      }
      if (node.items?.length) {
        await visit(node.items, level + 1);
      }
    }
  }

  await visit(outline, 1);
  return result;
}

async function resolveOutlinePage(
  pdf: {
    getDestination(name: string): Promise<unknown[] | null>;
    getPageIndex(ref: unknown): Promise<number>;
  },
  destination: string | unknown[] | null | undefined
): Promise<number | null> {
  try {
    const resolved =
      typeof destination === "string" ? await pdf.getDestination(destination) : destination;
    const reference = Array.isArray(resolved) ? resolved[0] : null;
    if (!reference) {
      return null;
    }
    return (await pdf.getPageIndex(reference)) + 1;
  } catch {
    return null;
  }
}

function extractPrintedPage(text: string, fallback: number): string {
  const patterns = [
    /页\s*(\d+)\s*\/\s*\d+/,
    /(\d+)\s*\/\s*(\d+)/,
    /(?:第\s*)?(\d+)\s*页/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return String(fallback);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
