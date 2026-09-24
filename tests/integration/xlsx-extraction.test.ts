import { describe, expect, it } from "vitest";
import { extractWorkbook } from "../../src/main/ingestion/xlsx-extractor";
import { sampleXlsx } from "../helpers/corpus";

describe.skipIf(!sampleXlsx)("extractWorkbook", () => {
  it("preserves worksheet rows from the pin table", async () => {
    const result = await extractWorkbook(sampleXlsx as string);

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]?.rows).toHaveLength(50);
    expect(result.sheets[0]?.rows[2]?.[0]).toBe("1");
    expect(String(result.sheets[0]?.rows[2]?.[1])).toContain("VBAT");
  });
});
