import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../src/main/api/key-redaction";

describe("redactSecrets", () => {
  it("removes all configured secrets", () => {
    const message = "request failed: Bearer sk-secret and sk-secret";
    expect(redactSecrets(message, ["sk-secret"])).toBe(
      "request failed: Bearer [REDACTED] and [REDACTED]"
    );
  });
});
