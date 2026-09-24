import { app, safeStorage } from "electron";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const dataRoot = process.env.STM32_RAG_DATA_ROOT || process.argv[2];
if (!dataRoot) {
  throw new Error("请通过 STM32_RAG_DATA_ROOT 或第一个参数指定资料库目录。");
}

// safeStorage is scoped to the app's userData directory, so mirror what
// src/main/index.ts does before touching the encrypted secret.
app.setPath("userData", join(dataRoot, "app-state"));

app.whenReady().then(async () => {
  try {
    const settings = JSON.parse(
      await readFile(join(dataRoot, "settings.json"), "utf8")
    );
    const secrets = JSON.parse(await readFile(join(dataRoot, "secret.bin"), "utf8"));
    if (!secrets.chat) {
      console.log("NO_CHAT_KEY");
      app.exit(1);
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      console.log("SAFE_STORAGE_UNAVAILABLE");
      app.exit(1);
      return;
    }

    const apiKey = safeStorage.decryptString(Buffer.from(secrets.chat, "base64"));
    const iconPath = join("resources", "icons", "64x64.png");
    const image = existsSync(iconPath)
      ? (await readFile(iconPath)).toString("base64")
      : "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const baseUrl = settings.chatBaseUrl.replace(/\/+$/, "");
    console.log(`endpoint: ${baseUrl}/chat/completions`);
    console.log(`model: ${settings.chatModel}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.chatModel,
        max_tokens: 32,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "这张图片里有什么？只回答一个词。" },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${image}` }
              }
            ]
          }
        ]
      })
    });

    const text = await response.text();
    console.log("http status:", response.status);
    console.log("response:", text.slice(0, 500));
  } catch (error) {
    console.log("PROBE_ERROR:", error instanceof Error ? error.message : String(error));
  }
  app.exit(0);
});
