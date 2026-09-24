export interface OutlineHeadingNode {
  title: string;
  level: number;
  pageNumber: number;
}

/**
 * Resolves the heading that owns a page. The outline is walked in document
 * order, which is not always ascending by page, so pick the deepest node whose
 * page is closest to (and not after) the requested page.
 */
export function headingForPage(
  outline: OutlineHeadingNode[],
  pageNumber: number
): string | null {
  let best: OutlineHeadingNode | null = null;

  for (const node of outline) {
    if (node.pageNumber > pageNumber) {
      continue;
    }
    if (
      !best ||
      node.pageNumber > best.pageNumber ||
      (node.pageNumber === best.pageNumber && node.level >= best.level)
    ) {
      best = node;
    }
  }

  return best?.title ?? null;
}
