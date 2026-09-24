export const COMPOSER_MIN_HEIGHT = 78;
export const COMPOSER_MAX_HEIGHT = 220;

/** Keeps the auto-grown composer height inside its readable range. */
export function clampComposerHeight(
  contentHeight: number,
  min = COMPOSER_MIN_HEIGHT,
  max = COMPOSER_MAX_HEIGHT
): number {
  if (!Number.isFinite(contentHeight)) {
    return min;
  }
  return Math.min(Math.max(Math.round(contentHeight), min), max);
}
