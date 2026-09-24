/**
 * Normalises a pasted/selected screenshot before OCR: scale small captures up
 * (Windows OCR is much more accurate on larger glyphs) and re-encode to PNG.
 */
export interface PreparedImage {
  dataUrl: string;
  bytes: Uint8Array;
}

export async function prepareImage(
  file: Blob,
  targetLongSide = 1200
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    // Upscale small captures for better recognition, but cap large ones so the
    // multimodal request stays cheap.
    const longest = Math.max(1, bitmap.width, bitmap.height);
    const scale = Math.min(2.5, Math.max(0.4, targetLongSide / longest));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("当前环境不支持 Canvas，无法处理图片。");
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");
    const binary = atob(dataUrl.split(",")[1] ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { dataUrl, bytes };
  } finally {
    bitmap.close?.();
  }
}
