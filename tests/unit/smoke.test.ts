import { describe, expect, it } from "vitest";
import { APP_NAME } from "../../src/shared/constants";

describe("application identity", () => {
  it("uses the product name", () => {
    expect(APP_NAME).toBe("STM32 手册智能体");
  });
});
