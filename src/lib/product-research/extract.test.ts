import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import {
  extractDocumentText,
  PASTE_MATERIALS_NEXT_STEP,
} from "@/lib/product-research/extract";

const FIXTURE_DIR = join(process.cwd(), "tmp", "upload-fixtures");

async function writeDocxFixture(path: string, text: string): Promise<void> {
  const require = createRequire(import.meta.url);
  const JSZip = require("jszip") as typeof import("jszip");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`,
  );
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(path, buf);
}

describe("extractDocumentText uploads", () => {
  beforeAll(async () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    const productLine =
      "Acme sells analytics for mid-market revenue teams who need forecast confidence.";

    writeFileSync(
      join(FIXTURE_DIR, "sample.txt"),
      `Acme Product Overview.\n${productLine}`,
    );
    writeFileSync(
      join(FIXTURE_DIR, "sample.md"),
      `# Acme\n\n${productLine}`,
    );
    writeFileSync(
      join(FIXTURE_DIR, "sample.pdf"),
      [
        "%PDF-1.4",
        "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
        "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
        "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj",
        "4 0 obj<< /Length 68 >>stream",
        "BT /F1 12 Tf 20 100 Td (Acme sells analytics for mid-market revenue teams.) Tj ET",
        "endstream",
        "endobj",
        "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
        "xref",
        "0 6",
        "0000000000 65535 f ",
        "0000000009 00000 n ",
        "0000000058 00000 n ",
        "0000000115 00000 n ",
        "0000000266 00000 n ",
        "0000000385 00000 n ",
        "trailer<< /Size 6 /Root 1 0 R >>",
        "startxref",
        "462",
        "%%EOF",
      ].join("\n"),
    );
    await writeDocxFixture(join(FIXTURE_DIR, "sample.docx"), productLine);
  });

  it("extracts TXT", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.txt"));
    const result = await extractDocumentText({
      filename: "sample.txt",
      mimeType: "text/plain",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("extracts MD", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.md"));
    const result = await extractDocumentText({
      filename: "sample.md",
      mimeType: "text/markdown",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("extracts DOCX", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.docx"));
    const result = await extractDocumentText({
      filename: "sample.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("extracts PDF even when @napi-rs/canvas native bindings are missing", async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, "sample.pdf"));
    const result = await extractDocumentText({
      filename: "sample.pdf",
      mimeType: "application/pdf",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/Acme sells analytics/i);
    }
  });

  it("failed reads include a paste next step", async () => {
    const result = await extractDocumentText({
      filename: "empty.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorSafe).toContain(PASTE_MATERIALS_NEXT_STEP);
      expect(result.errorSafe).not.toMatch(/Could not safely extract/i);
    }
  });
});
