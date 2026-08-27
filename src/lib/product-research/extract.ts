/**
 * Safe document text extraction for Product materials.
 * Never executes macros/scripts. Unsupported types fail closed.
 *
 * PDF path: pdf-parse v2 → pdfjs-dist needs DOMMatrix. On hosts without a working
 * @napi-rs/canvas native binding (e.g. Windows ARM64), we install minimal polyfills
 * before importing pdf-parse so text extraction still works.
 */

export type ExtractResult =
  | { ok: true; text: string; mimeType: string }
  | { ok: false; errorSafe: string };

const MAX_EXTRACT_CHARS = 200_000;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MiB

/** Shared next step whenever a source cannot be read. */
export const PASTE_MATERIALS_NEXT_STEP =
  "Paste the product description into the paste field and try again.";

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

function withPasteHint(problem: string): string {
  const trimmed = problem.trim().replace(/\.$/, "");
  return `${trimmed}. ${PASTE_MATERIALS_NEXT_STEP}`;
}

export function getUploadExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isSupportedUpload(filename: string, mimeType: string): boolean {
  const ext = getUploadExtension(filename);
  if (!(SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    return false;
  }
  // PPTX intentionally unsupported for now — abstraction allows later add.
  if (ext === ".pptx") return false;
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();
  if (mime === "application/octet-stream") return true;
  if (ext === ".pdf")
    return mime === "application/pdf" || mime === "application/octet-stream";
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
    return {
      ok: false,
      errorSafe: withPasteHint("Uploaded file is empty"),
    };
  }
  if (byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      errorSafe: withPasteHint(
        `Uploaded file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit`,
      ),
    };
  }
  return null;
}

function truncate(text: string): string {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length <= MAX_EXTRACT_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_EXTRACT_CHARS)}\n\n[truncated]`;
}

/**
 * Minimal browser globals so pdfjs-dist can load when @napi-rs/canvas native
 * bindings are unavailable. Sufficient for text extraction (not rendering).
 */
export function installPdfjsNodePolyfills(): void {
  const g = globalThis as Record<string, unknown>;

  if (typeof g.DOMMatrix === "undefined") {
    class DOMMatrixPolyfill {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      multiplySelf() {
        return this;
      }
      translateSelf() {
        return this;
      }
      scaleSelf() {
        return this;
      }
      multiply() {
        return new DOMMatrixPolyfill();
      }
      translate() {
        return new DOMMatrixPolyfill();
      }
      scale() {
        return new DOMMatrixPolyfill();
      }
      inverse() {
        return new DOMMatrixPolyfill();
      }
    }
    g.DOMMatrix = DOMMatrixPolyfill;
  }

  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      constructor(width = 1, height = 1) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }

  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {};
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult> {
  installPdfjsNodePolyfills();
  // pdf-parse v2+: class API (PDFParse), not a default function.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const parsed = await parser.getText();
    const text = (parsed.text || "").trim();
    if (!text) {
      return {
        ok: false,
        errorSafe: withPasteHint(
          "This PDF has no extractable text (it may be image-only or scanned)",
        ),
      };
    }
    return { ok: true, text: truncate(text), mimeType: "application/pdf" };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
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
      errorSafe: withPasteHint(
        "Unsupported file type. Supported: PDF, DOCX, TXT, MD. PPTX is not enabled yet",
      ),
    };
  }

  const ext = getUploadExtension(input.filename);

  try {
    if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(
        input.bytes,
      );
      if (!text.trim()) {
        return {
          ok: false,
          errorSafe: withPasteHint("Document contained no extractable text"),
        };
      }
      return { ok: true, text: truncate(text), mimeType: input.mimeType };
    }

    if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(input.bytes),
      });
      const text = (result.value || "").trim();
      if (!text) {
        return {
          ok: false,
          errorSafe: withPasteHint("DOCX contained no extractable text"),
        };
      }
      return {
        ok: true,
        text: truncate(text),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }

    if (ext === ".pdf") {
      return extractPdfText(input.bytes);
    }

    return {
      ok: false,
      errorSafe: withPasteHint("Unsupported file type for extraction"),
    };
  } catch (error) {
    const detail =
      error instanceof Error && error.message.includes("DOMMatrix")
        ? "PDF reader could not start in this environment"
        : "Could not read text from this document";
    return {
      ok: false,
      errorSafe: withPasteHint(detail),
    };
  }
}
