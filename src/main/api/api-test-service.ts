import type { ApiConnectionResult, ApiSettings } from "../../shared/types";
import { OpenAIClient } from "./openai-client";

export async function testChatConnection(
  settings: ApiSettings,
  apiKey: string
): Promise<ApiConnectionResult> {
  try {
    const client = new OpenAIClient();
    let received = false;
    for await (const delta of client.chatStream({
      baseUrl: settings.chatBaseUrl,
      apiKey,
      model: settings.chatModel,
      messages: [{ role: "user", content: "只回复 OK" }],
      maxTokens: 4,
      timeoutMs: settings.requestTimeoutMs
    })) {
      if (delta) {
        received = true;
        break;
      }
    }
    return received
      ? { ok: true, message: "聊天接口连接成功。" }
      : { ok: false, message: "聊天接口已响应，但没有返回文本。" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function testEmbeddingConnection(
  settings: ApiSettings,
  apiKey: string
): Promise<ApiConnectionResult> {
  try {
    const client = new OpenAIClient();
    const result = await client.embed({
      baseUrl: settings.embeddingBaseUrl,
      apiKey,
      model: settings.embeddingModel,
      input: ["STM32"],
      timeoutMs: settings.requestTimeoutMs
    });
    return result.vectors[0]?.length
      ? { ok: true, message: `向量接口连接成功，维度 ${result.vectors[0].length}。` }
      : { ok: false, message: "向量接口没有返回有效维度。" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\b404\b/.test(message) || /not found/i.test(message)) {
      return {
        ok: false,
        message:
          "当前服务不支持 /embeddings（404）。同一个 API Key 只有在服务商同时提供向量接口时才能复用；请为向量模型单独配置支持 embedding 的 Base URL、Key 和模型。"
      };
    }
    return {
      ok: false,
      message
    };
  }
}
