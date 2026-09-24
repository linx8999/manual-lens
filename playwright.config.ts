import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120000,
  expect: {
    timeout: 30000
  },
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure"
  }
});
