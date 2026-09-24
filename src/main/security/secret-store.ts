import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

type SecretName = "chat" | "embedding";
type SecretFile = Partial<Record<SecretName, string>>;

export class SecretStore {
  readonly path: string;

  constructor(
    dataRoot: string,
    private readonly cipher: SecretCipher
  ) {
    this.path = join(dataRoot, "secret.bin");
  }

  private async readFileContents(): Promise<SecretFile> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as SecretFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private async writeFileContents(contents: SecretFile): Promise<void> {
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(contents)}\n`, "utf8");
    await rename(temporaryPath, this.path);
  }

  async setApiKey(name: SecretName, apiKey: string): Promise<void> {
    if (!this.cipher.isEncryptionAvailable()) {
      throw new Error("当前系统无法使用安全凭据存储，API 密钥不会被明文写入磁盘。");
    }
    const contents = await this.readFileContents();
    contents[name] = this.cipher.encryptString(apiKey).toString("base64");
    await this.writeFileContents(contents);
  }

  async getApiKey(name: SecretName): Promise<string | null> {
    const contents = await this.readFileContents();
    const encrypted = contents[name];
    if (!encrypted) {
      return null;
    }
    if (!this.cipher.isEncryptionAvailable()) {
      throw new Error("当前系统无法解密已保存的 API 密钥。");
    }
    return this.cipher.decryptString(Buffer.from(encrypted, "base64"));
  }

  async hasApiKey(name: SecretName): Promise<boolean> {
    const contents = await this.readFileContents();
    return Boolean(contents[name]);
  }
}
