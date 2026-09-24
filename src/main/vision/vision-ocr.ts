export interface VisionOcrOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const TRANSCRIBE_PROMPT =
  "你是 OCR 引擎。逐字转录这张手册截图里的全部文字，保留原有的中英文、寄存器名、数字和单位。" +
  "只输出转录文本，不要解释、不要总结、不要添加标题或标记。";

/**
 * Transcribes a screenshot with the configured multimodal chat model, reusing
 * the same OpenAI-compatible endpoint as the chat. Returns null on any failure
 * so the caller can fall back to the local OCR engine.
 */
export async function transcribeWithVision(
  options: VisionOcrOptions,
  bytes: Uint8Array
): Promise<string | null> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(15_000, options.timeoutMs)
  );

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: TRANSCRIBE_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
