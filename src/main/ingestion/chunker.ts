export interface ChunkPageInput {
  pageNumber: number;
  printedPage: string | null;
  text: string;
  heading?: string | null;
}

export interface PageChunk {
  pageNumber: number;
  printedPage: string | null;
  chunkIndex: number;
  heading: string | null;
  text: string;
}

const DEFAULT_MAX_CHARS = 700;
const DEFAULT_OVERLAP_CHARS = 120;
const MIN_CHUNK_CHARS = 160;

export function chunkPages(
  pages: ChunkPageInput[],
  maxChars = DEFAULT_MAX_CHARS,
  overlapChars = DEFAULT_OVERLAP_CHARS
): PageChunk[] {
  const chunks: PageChunk[] = [];

  for (const page of pages) {
    const text = normalizePageText(page.text);
    if (!text) {
      continue;
    }

    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      const proposedEnd = Math.min(start + maxChars, text.length);
      const end = findNaturalEnd(text, start, proposedEnd);
      const chunkText = text.slice(start, end).trim();

      if (chunkText) {
        chunks.push({
          pageNumber: page.pageNumber,
          printedPage: page.printedPage,
          chunkIndex,
          heading: page.heading ?? null,
          text: chunkText
        });
        chunkIndex += 1;
      }

      if (end >= text.length) {
        break;
      }

      const nextStart = Math.max(start + 1, end - overlapChars);
      start = skipLeadingWhitespace(text, nextStart);
    }
  }

  return chunks;
}

export function normalizePageText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function findNaturalEnd(text: string, start: number, proposedEnd: number): number {
  if (proposedEnd >= text.length) {
    return text.length;
  }

  const minimum = Math.min(text.length, start + MIN_CHUNK_CHARS);
  for (let index = proposedEnd; index >= minimum; index -= 1) {
    const character = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (character === "\n" || /[。！？；.!?;]/.test(character)) {
      return index + 1;
    }
    if (character === " " && /[\u3400-\u9fff]/.test(next)) {
      return index + 1;
    }
  }

  return proposedEnd;
}

function skipLeadingWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && /\s/.test(text[index] ?? "")) {
    index += 1;
  }
  return index;
}
