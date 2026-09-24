export function resolvePageNumber(requested: number, pageCount: number): number {
  if (!Number.isFinite(requested)) {
    return 1;
  }
  return Math.min(Math.max(1, Math.round(requested)), Math.max(1, pageCount));
}

export function pageScrollTop(
  pageNumber: number,
  pageHeight: number,
  gap: number
): number {
  return Math.max(0, (pageNumber - 1) * (pageHeight + gap));
}

export function pageFromScrollTop(
  scrollTop: number,
  pageHeight: number,
  gap: number,
  pageCount: number
): number {
  if (pageHeight <= 0) {
    return 1;
  }
  return resolvePageNumber(
    Math.floor(scrollTop / (pageHeight + gap)) + 1,
    pageCount
  );
}

/**
 * Page slots scale with the reader width, so the scroll offset has to scale by
 * the same factor to keep the reader looking at the same spot on the page.
 */
export function rescaleScrollTop(
  scrollTop: number,
  previousSlotHeight: number,
  nextSlotHeight: number
): number {
  if (previousSlotHeight <= 0 || nextSlotHeight <= 0) {
    return Math.max(0, scrollTop);
  }
  return Math.max(0, scrollTop * (nextSlotHeight / previousSlotHeight));
}

export function normalizeExcerpt(value: string | null): string {
  return (value ?? "").replace(/\s+/g, "").trim();
}

export function textMatchesExcerpt(text: string, normalizedExcerpt: string): boolean {
  const normalizedText = normalizeExcerpt(text);
  if (normalizedText.length < 2 || normalizedExcerpt.length < 2) {
    return false;
  }
  return normalizedExcerpt.includes(normalizedText) || normalizedText.includes(normalizedExcerpt);
}
