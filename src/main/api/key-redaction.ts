export function redactSecrets(message: string, secrets: Array<string | null | undefined>): string {
  let result = message;
  for (const secret of secrets) {
    if (secret) {
      result = result.split(secret).join("[REDACTED]");
    }
  }
  return result;
}
