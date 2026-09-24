export function extractSupportedModels(message: string): string[] {
  const match = message.match(
    /supported API model names are\s+(.+?)(?:,\s*but you passed|\s+but you passed|\.)/i
  );
  if (!match?.[1]) {
    return [];
  }
  return [
    ...new Set(
      match[1]
        .split(/[,，]/)
        .map((model) => model.trim())
        .filter(Boolean)
    )
  ];
}

export function choosePreferredModel(
  models: string[],
  purpose: "chat" | "embedding"
): string | null {
  if (models.length === 0) {
    return null;
  }
  if (purpose === "embedding") {
    return chooseEmbeddingModel(models);
  }
  return (
    models.find(
      (model) =>
        !/embedding|embed|whisper|tts|image|moderation/i.test(model)
    ) ?? models[0] ?? null
  );
}

export function chooseEmbeddingModel(models: string[]): string | null {
  return models.find((model) => /embedding|embed/i.test(model)) ?? models[0] ?? null;
}
