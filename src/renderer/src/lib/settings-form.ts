import type { ApiSettings, ImageEngine, ThemeName } from "../../../shared/types";

export interface SettingsFormState {
  chatBaseUrl: string;
  chatModel: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
  chatApiKey: string;
  embeddingApiKey: string;
  requestTimeoutMs: number;
  theme: ThemeName;
  imageEngine: ImageEngine;
}

export function createSettingsForm(settings: ApiSettings | null): SettingsFormState {
  return {
    chatBaseUrl: settings?.chatBaseUrl ?? "",
    chatModel: settings?.chatModel ?? "",
    embeddingBaseUrl: settings?.embeddingBaseUrl ?? "",
    embeddingModel: settings?.embeddingModel ?? "",
    chatApiKey: "",
    embeddingApiKey: "",
    requestTimeoutMs: settings?.requestTimeoutMs ?? 60000,
    theme: settings?.theme ?? "blue",
    imageEngine: settings?.imageEngine ?? "vision"
  };
}

export function syncSettingsForm(
  current: SettingsFormState,
  settings: ApiSettings
): SettingsFormState {
  return {
    ...current,
    chatBaseUrl: settings.chatBaseUrl,
    chatModel: settings.chatModel,
    embeddingBaseUrl: settings.embeddingBaseUrl,
    embeddingModel: settings.embeddingModel,
    requestTimeoutMs: settings.requestTimeoutMs,
    theme: settings.theme,
    imageEngine: settings.imageEngine
  };
}
