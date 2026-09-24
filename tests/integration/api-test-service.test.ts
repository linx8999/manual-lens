import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { testEmbeddingConnection } from "../../src/main/api/api-test-service";
import type { ApiSettings } from "../../src/shared/types";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
    )
  );
});

describe("embedding connection diagnostics", () => {
  it("explains that a 404 means the provider has no embeddings endpoint", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Not Found" } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server address is unavailable.");
    }
    const settings: ApiSettings = {
      chatBaseUrl: `http://127.0.0.1:${address.port}`,
      chatModel: "chat",
      embeddingBaseUrl: `http://127.0.0.1:${address.port}`,
      embeddingModel: "chat",
      chatApiKeyConfigured: true,
      embeddingApiKeyConfigured: true,
      requestTimeoutMs: 5000,
      theme: "blue", imageEngine: "local"
    };

    const result = await testEmbeddingConnection(settings, "sk-test");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("不支持 /embeddings");
    expect(result.message).toContain("单独配置");
  });
});
