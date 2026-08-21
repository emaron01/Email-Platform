/**
 * Safe document text extraction for Product materials.
 * Never executes macros/scripts. Unsupported types fail closed.
 */

export type ExtractResult =
  | { ok: true; text: string; mimeType: string }
  | { ok: false; errorSafe: string };

const MAX_EXTRACT_CHARS = 200_000;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MiB

export const SUPPORTED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
] as const;

export const SUPPORTED_UPLOAD_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream", // allow when extension is trusted
]);

export function getUploadExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isSupportedUpload(filename: string, mimeType: string): boolean {
  const ext = getUploadExtension(filename);
  if (
    !(SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)
  ) {
    return false;
  }
  // PPTX intentionally unsupported for now — abstraction allows later add.
  if (ext === ".pptx") return false;
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();
  if (mime === "application/octet-stream") return true;
  if (ext === ".pdf") return mime === "application/pdf" || mime === "application/octet-stream";
  if (ext === ".docx") {
    return (
      mime.includes("wordprocessingml") ||
      mime === "application/octet-stream" ||
      mime === "application/zip"
    );
  }
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return mime.startsWith("text/") || mime === "application/octet-stream";
  }
  return SUPPORTED_UPLOAD_MIMES.has(mime);
}

export function assertUploadSize(byteLength: number): ExtractResult | null {
  if (byteLength <= 0) {
    return { ok: false, errorSafe: "Uploaded file is empty." };
  }
  if (byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      errorSafe: `Uploaded file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit.`,
    };
  }
  return null;
}

function truncate(text: string): string {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length <= MAX_EXTRACT_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_EXTRACT_CHARS)}\n\n[truncated]`;
}

export async function extractDocumentText(input: {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ExtractResult> {
  const sizeErr = assertUploadSize(input.bytes.byteLength);
  if (sizeErr) return sizeErr;

  if (!isSupportedUpload(input.filename, input.mimeType)) {
    return {
      ok: false,
      errorSafe:
        "Unsupported file type. Supported: PDF, DOCX, TXT, MD. PPTX is not enabled yet.",
    };
  }

  const ext = getUploadExtension(input.filename);

  try {
    if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
      if (!text.trim()) {
        return { ok: false, errorSafe: "Document contained no extractable text." };
      }
      return { ok: true, text: truncate(text), mimeType: input.mimeType };
    }

    if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
      const text = (result.value || "").trim();
      if (!text) {
        return { ok: false, errorSafe: "DOCX contained no extractable text." };
      }
      return {
        ok: true,
        text: truncate(text),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }

    if (ext === ".pdf") {
      // pdf-parse v2+: class API (PDFParse), not a default function.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: Buffer.from(input.bytes) });
      try {
        const parsed = await parser.getText();
        const text = (parsed.text || "").trim();
        if (!text) {
          return { ok: false, errorSafe: "PDF contained no extractable text." };
        }
        return { ok: true, text: truncate(text), mimeType: "application/pdf" };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }

    return {
      ok: false,
      errorSafe: "Unsupported file type for extraction.",
    };
  } catch {
    return {
      ok: false,
      errorSafe: "Could not safely extract text from this document.",
    };
  }
}
