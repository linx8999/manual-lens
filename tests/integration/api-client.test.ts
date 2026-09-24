import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { OpenAIClient } from "../../src/main/api/openai-client";

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

async function startServer(
  handler: Parameters<typeof createServer>[1]
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server address is unavailable.");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

describe("OpenAIClient", () => {
  it("streams chat text and sends bearer authentication", async () => {
    let authorization = "";
    const { baseUrl } = await startServer((request, response) => {
      authorization = request.headers.authorization ?? "";
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"choices":[{"delta":{"content":"PA9"}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":" 可配置"}}]}\n\n');
      response.end("data: [DONE]\n\n");
    });
    const client = new OpenAIClient();

    const chunks: string[] = [];
    for await (const delta of client.chatStream({
      baseUrl,
      apiKey: "sk-test",
      model: "test-chat",
      messages: [{ role: "user", content: "PA9" }]
    })) {
      chunks.push(delta);
    }

    expect(chunks.join("")).toBe("PA9 可配置");
    expect(authorization).toBe("Bearer sk-test");
  });

  it("does not forward local message ids to the chat endpoint", async () => {
    let body: unknown;
    const { baseUrl } = await startServer((request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        body = JSON.parse(raw);
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n');
      });
    });
    const client = new OpenAIClient();

    for await (const _delta of client.chatStream({
      baseUrl,
      apiKey: "sk-test",
      model: "test-chat",
      messages: [
        {
          id: "resp_3001ae50-fa3c-45cd-8e25-e4263f2d3db6_msg",
          role: "user",
          content: "PA9"
        }
      ] as never
    })) {
      // Drain the stream so the request completes.
    }

    expect(body).toMatchObject({
      messages: [{ role: "user", content: "PA9" }]
    });
    expect(JSON.stringify(body)).not.toContain("resp_3001ae50");
  });

  it("returns embedding vectors", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [{ index: 0, embedding: [1, 0, 0] }],
          model: "test-embedding"
        })
      );
    });
    const client = new OpenAIClient();

    const result = await client.embed({
      baseUrl,
      apiKey: "sk-test",
      model: "test-embedding",
      input: ["PA9"]
    });

    expect(result.model).toBe("test-embedding");
    expect(Array.from(result.vectors[0] ?? [])).toEqual([1, 0, 0]);
  });

  it("lists available models from the compatible models endpoint", async () => {
    const { baseUrl } = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [{ id: "deepseek-v4-pro" }, { id: "deepseek-flash" }]
        })
      );
    });
    const client = new OpenAIClient();

    const models = await client.listModels({
      baseUrl,
      apiKey: "sk-test"
    });

    expect(models).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
  });
});
