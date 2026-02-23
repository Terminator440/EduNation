/**
 * Parse Excel (.xlsx) first sheet into rows compatible with bulk import (Record<string, string>[]).
 * Requires dependency "xlsx" (npm install xlsx).
 */
export type ParseExcelResult = { rows: Record<string, string>[]; error?: string };

export async function parseExcelFromArrayBuffer(
  buffer: ArrayBuffer
): Promise<ParseExcelResult> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return { rows: [], error: "Niciun sheet în fișier" };
    const sheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
    if (data.length < 2) return { rows: [], error: "Fișierul Excel este gol sau are doar header" };
    const headers = data[0].map((h, j) => String(h ?? "").trim() || `col_${j}`);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < data.length; i++) {
      const row: Record<string, string> = {};
      const values = data[i] ?? [];
      headers.forEach((h, j) => {
        row[h] = String(values[j] ?? "").trim();
      });
      rows.push(row);
    }
    return { rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare la parsare Excel";
    return { rows: [], error: msg };
  }
}
