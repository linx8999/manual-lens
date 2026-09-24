import { describe, expect, it } from "vitest";
import { extractPdf } from "../../src/main/ingestion/pdf-extractor";
import { samplePdf } from "../helpers/corpus";

describe.skipIf(!samplePdf)("extractPdf", () => {
  it("extracts pages, text, and outline from a supplied manual", async () => {
    const result = await extractPdf(samplePdf as string);

    expect(result.pageCount).toBe(22);
    expect(result.pages[0]?.text).toContain("STM32F10xxx");
    expect(result.outline.length).toBeGreaterThan(0);
    expect(result.outline[0]?.pageNumber).toBeGreaterThan(0);
  }, 30000);
});
