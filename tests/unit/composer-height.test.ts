import { describe, expect, it } from "vitest";
import {
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  clampComposerHeight
} from "../../src/renderer/src/lib/composer";

describe("clampComposerHeight", () => {
  it("keeps short content at the minimum height", () => {
    expect(clampComposerHeight(40)).toBe(COMPOSER_MIN_HEIGHT);
  });

  it("grows with the content", () => {
    expect(clampComposerHeight(150)).toBe(150);
  });

  it("stops at the maximum height so long input scrolls", () => {
    expect(clampComposerHeight(900)).toBe(COMPOSER_MAX_HEIGHT);
  });

  it("falls back to the minimum height for invalid input", () => {
    expect(clampComposerHeight(Number.NaN)).toBe(COMPOSER_MIN_HEIGHT);
  });
});
