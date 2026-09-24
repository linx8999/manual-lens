import { readFile } from "node:fs/promises";

export interface ImageExtraction {
  title: string;
  width: number | null;
  height: number | null;
  mimeType: string;
}

export async function extractImage(path: string): Promise<ImageExtraction> {
  const bytes = await readFile(path);
  const extension = path.split(".").pop()?.toLowerCase();
  const title = path.split(/[\\/]/).pop() || "图片资料";

  if (extension === "png" && bytes.length >= 24) {
    return {
      title,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      mimeType: "image/png"
    };
  }

  return {
    title,
    width: null,
    height: null,
    mimeType: extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "application/octet-stream"
  };
}
