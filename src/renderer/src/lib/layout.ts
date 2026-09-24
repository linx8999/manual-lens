const SIDEBAR_WIDTH = 252;
const CHAT_MIN_WIDTH = 470;
const WORKSPACE_GAPS = 50;
const MAX_READER_WIDTH = 980;
const READER_PAGE_PADDING = 32;
const MIN_PAGE_WIDTH = 320;

export function clampReaderWidth(value: number, viewportWidth: number): number {
  const minimum = viewportWidth >= 1200 ? 440 : 320;
  const available = viewportWidth - SIDEBAR_WIDTH - CHAT_MIN_WIDTH - WORKSPACE_GAPS;
  const maximum = Math.max(minimum, Math.min(MAX_READER_WIDTH, available));
  return Math.round(Math.min(maximum, Math.max(minimum, value)));
}

/**
 * While the reader is being dragged we keep the PDF canvas rasterised at its
 * old size and scale it with a GPU transform, so dragging never re-renders
 * pages. This returns the transform scale for a live container width.
 */
export function readerDragScale(
  frozenContainerWidth: number,
  liveContainerWidth: number
): number {
  const frozenPageWidth = Math.max(
    MIN_PAGE_WIDTH,
    frozenContainerWidth - READER_PAGE_PADDING
  );
  const livePageWidth = Math.max(
    MIN_PAGE_WIDTH,
    liveContainerWidth - READER_PAGE_PADDING
  );
  if (frozenPageWidth <= 0) {
    return 1;
  }
  const scale = livePageWidth / frozenPageWidth;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
