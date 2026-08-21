import Papa from "papaparse";
import type { ParsedTable } from "@/lib/import/types";

function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => !String(cell ?? "").trim());
}

function normalizeCells(cells: string[], width: number): string[] {
  const next = cells.map((cell) => String(cell ?? "").trim());
  while (next.length < width) next.push("");
  return next.slice(0, width);
}

export function detectDelimiter(text: string): string {
  const sample = text
    .split(/\r?\n/)
    .slice(0, 5)
    .filter((line) => line.trim().length > 0)
    .join("\n");

  if (!sample) return ",";

  const counts = {
    "\t": (sample.match(/\t/g) ?? []).length,
    ",": (sample.match(/,/g) ?? []).length,
    ";": (sample.match(/;/g) ?? []).length,
  };

  if (counts["\t"] > 0 && counts["\t"] >= counts[","] && counts["\t"] >= counts[";"]) {
    return "\t";
  }
  if (counts[";"] > counts[","] && counts[";"] > counts["\t"]) {
    return ";";
  }
  return ",";
}

export function parseDelimitedText(text: string, delimiter?: string): ParsedTable {
  const errors: string[] = [];
  const trimmed = text.replace(/^\uFEFF/, "").trim();

  if (!trimmed) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      delimiter: delimiter ?? ",",
      errors: ["No data to parse."],
    };
  }

  const resolvedDelimiter = delimiter ?? detectDelimiter(trimmed);

  const parsed = Papa.parse<string[]>(trimmed, {
    delimiter: resolvedDelimiter,
    skipEmptyLines: false,
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors.slice(0, 5)) {
      errors.push(`Parse warning (row ${error.row ?? "?"}): ${error.message}`);
    }
  }

  const matrix = (parsed.data ?? [])
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []))
    .filter((row) => !isBlankRow(row));

  if (matrix.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      delimiter: resolvedDelimiter,
      errors: ["No non-empty rows found."],
    };
  }

  const headers = matrix[0].map((header, index) => {
    const value = header.trim();
    return value || `Column ${index + 1}`;
  });

  const width = headers.length;
  const rows = matrix.slice(1).map((row) => normalizeCells(row, width));

  return {
    headers,
    rows,
    totalRows: rows.length,
    delimiter: resolvedDelimiter,
    errors,
  };
}

export function parseCsvText(text: string): ParsedTable {
  return parseDelimitedText(text, ",");
}

export function parseCsvFileText(text: string): ParsedTable {
  return parseDelimitedText(text);
}

export function defaultListNameForPaste(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `Pasted Contacts - ${yyyy}-${mm}-${dd}`;
}

export function defaultListNameForUpload(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return base || "Uploaded Contacts";
}
