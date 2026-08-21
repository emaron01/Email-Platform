import * as XLSX from "xlsx";
import type { ParsedTable } from "@/lib/import/types";

function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => !String(cell ?? "").trim());
}

function sheetToTable(
  workbook: XLSX.WorkBook,
  sheetName: string,
): Omit<ParsedTable, "sheetNames" | "activeSheet"> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: [`Worksheet "${sheetName}" was not found.`],
    };
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  );

  const cleaned = matrix
    .map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()),
    )
    .filter((row) => !isBlankRow(row));

  if (cleaned.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: ["Selected worksheet has no data."],
    };
  }

  const headers = cleaned[0].map((header, index) => header || `Column ${index + 1}`);
  const width = headers.length;
  const rows = cleaned.slice(1).map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next.slice(0, width);
  });

  return {
    headers,
    rows,
    totalRows: rows.length,
    errors: [],
  };
}

export function listWorkbookSheets(data: ArrayBuffer): string[] {
  const workbook = XLSX.read(data, { type: "array" });
  return workbook.SheetNames;
}

export function parseXlsxArrayBuffer(
  data: ArrayBuffer,
  sheetName?: string,
): ParsedTable {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      sheetNames: [],
      errors: ["Workbook contains no worksheets."],
    };
  }

  const activeSheet = sheetName && sheetNames.includes(sheetName)
    ? sheetName
    : sheetNames[0];

  const table = sheetToTable(workbook, activeSheet);

  return {
    ...table,
    sheetNames,
    activeSheet,
  };
}
