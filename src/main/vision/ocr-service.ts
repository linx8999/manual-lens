import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Uses the OCR engine that ships with Windows (Windows.Media.Ocr) through
 * PowerShell, so no extra native dependency or model download is required.
 * Returns null when the platform or the installed language pack cannot help.
 */
export async function ocrImage(bytes: Uint8Array): Promise<string | null> {
  if (process.platform !== "win32") {
    return null;
  }

  const directory = await mkdtemp(join(tmpdir(), "stm32-rag-ocr-"));
  const imagePath = join(directory, "capture.png");
  const scriptPath = join(directory, "ocr.ps1");

  try {
    await Promise.all([
      writeFile(imagePath, bytes),
      writeFile(scriptPath, OCR_SCRIPT, "utf8")
    ]);
    const { stdout } = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Path",
        imagePath
      ],
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
    );
    const start = stdout.indexOf("TEXT_START");
    const end = stdout.indexOf("TEXT_END");
    if (start < 0 || end < 0) {
      return null;
    }
    const text = stdout.slice(start + "TEXT_START".length, end).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function isOcrAvailable(): boolean {
  return process.platform === "win32";
}

const OCR_SCRIPT = String.raw`param([string]$Path)
$ErrorActionPreference = "Stop"
# PowerShell pipes stdout using the console code page, which turns Chinese OCR
# text into mojibake for the Node side; force UTF-8 on both ends.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Foundation, ContentType=WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -like "IAsyncOperation*"
})[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
    Write-Output "OCR_ENGINE_UNAVAILABLE"
    exit 2
}

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output "TEXT_START"
Write-Output $result.Text
Write-Output "TEXT_END"
`;
