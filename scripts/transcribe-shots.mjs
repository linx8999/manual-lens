import { app, safeStorage } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dataRoot = process.argv[2];
if (!dataRoot) {
  throw new Error("用法：npx electron scripts/transcribe-shots.mjs <资料库目录>");
}

// safeStorage is scoped to the app's userData path.
app.setPath("userData", join(dataRoot, "app-state"));

const shotDir = resolve("artifacts", "image-match");
const outFile = join(shotDir, "transcriptions.json");
const PROMPT =
  "你是 OCR 引擎。逐字转录这张手册截图里的全部文字，保留原有的中英文、寄存器名、数字和单位。" +
  "只输出转录文本，不要解释、不要总结、不要添加标题或标记。";

app.whenReady().then(async () => {
  try {
    const settings = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    const secrets = JSON.parse(await readFile(join(dataRoot, "secret.bin"), "utf8"));
    const apiKey = safeStorage.decryptString(Buffer.from(secrets.chat, "base64"));
    const baseUrl = settings.chatBaseUrl.replace(/\/+$/, "");
    const manifest = JSON.parse(await readFile(join(shotDir, "manifest.json"), "utf8"));

    let existing = {};
    try {
      existing = JSON.parse(await readFile(outFile, "utf8"));
    } catch {
      existing = {};
    }

    let ok = 0;
    let failed = 0;
    for (const item of manifest) {
      if (existing[item.file]) {
        ok += 1;
        continue;
      }
      const bytes = await readFile(join(shotDir, item.file));
      let text = null;
      for (let attempt = 0; attempt < 2 && !text; attempt += 1) {
        try {
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: settings.chatModel,
              max_tokens: 1500,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: PROMPT },
                    {
                      type: "image_url",
                      image_url: { url: `data:image/png;base64,${bytes.toString("base64")}` }
                    }
                  ]
                }
              ]
            })
          });
          if (response.ok) {
            const payload = await response.json();
            text = payload.choices?.[0]?.message?.content?.trim() ?? "";
          } else {
            console.log(`  http ${response.status}: ${(await response.text()).slice(0, 120)}`);
          }
        } catch (error) {
          console.log(`  error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (text) {
        existing[item.file] = text;
        ok += 1;
      } else {
        existing[item.file] = "";
        failed += 1;
      }
      console.log(`${item.file} -> ${(text ?? "").length} chars`);
      await writeFile(outFile, JSON.stringify(existing, null, 2), "utf8");
    }
    console.log(`\ntranscribed ok=${ok} empty=${failed}`);
  } catch (error) {
    console.log("TRANSCRIBE_ERROR:", error instanceof Error ? error.message : String(error));
  }
  app.exit(0);
});
