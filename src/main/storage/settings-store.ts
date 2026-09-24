import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeTheme } from "../../shared/theme";
import type { ApiSettings, ApiSettingsInput } from "../../shared/types";

type PersistedSettings = Omit<
  ApiSettings,
  "chatApiKeyConfigured" | "embeddingApiKeyConfigured"
> & {
  requestTimeoutMs: number;
};

const DEFAULT_SETTINGS: PersistedSettings = {
  chatBaseUrl: "https://api.openai.com/v1",
  chatModel: "gpt-4.1-mini",
  embeddingBaseUrl: "https://api.openai.com/v1",
  embeddingModel: "text-embedding-3-small",
  requestTimeoutMs: 60000,
  theme: "blue",
  imageEngine: "vision"
};

export class SettingsStore {
  readonly path: string;

  constructor(dataRoot: string) {
    this.path = join(dataRoot, "settings.json");
  }

  async load(): Promise<PersistedSettings> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed, theme: normalizeTheme(parsed.theme) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { ...DEFAULT_SETTINGS };
      }
      throw error;
    }
  }

  async save(input: ApiSettingsInput): Promise<PersistedSettings> {
    const current = await this.load();
    const next: PersistedSettings = {
      chatBaseUrl: input.chatBaseUrl.trim() || current.chatBaseUrl,
      chatModel: input.chatModel.trim() || current.chatModel,
      embeddingBaseUrl: input.embeddingBaseUrl.trim() || current.embeddingBaseUrl,
      embeddingModel: input.embeddingModel.trim() || current.embeddingModel,
      requestTimeoutMs: input.requestTimeoutMs ?? current.requestTimeoutMs,
      theme: normalizeTheme(input.theme ?? current.theme),
      imageEngine: input.imageEngine === "local" ? "local" : "vision"
    };
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.path);
    return next;
  }
}

export { DEFAULT_SETTINGS };
export type { PersistedSettings };
