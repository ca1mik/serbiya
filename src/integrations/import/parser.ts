import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { AppError } from "@/lib/errors";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;
export async function parseImportFile(
  filename: string,
  bytes: Uint8Array,
): Promise<Record<string, string>[]> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new AppError("VALIDATION", "File exceeds the 2 MB upload limit", 400);
  if (!/^[\w .()\-\p{L}]+\.(csv|xlsx)$/iu.test(filename))
    throw new AppError(
      "VALIDATION",
      "Only CSV and XLSX files are supported",
      400,
    );
  let rows: Record<string, string>[];
  if (filename.toLowerCase().endsWith(".csv")) {
    const raw = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_quotes: false,
      trim: true,
      to: MAX_IMPORT_ROWS + 1,
    }) as Record<string, string>[];
  } else {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    const sheet = book.worksheets[0];
    if (!sheet || sheet.rowCount < 2)
      throw new AppError("VALIDATION", "Workbook has no data rows", 400);
    const headers = (sheet.getRow(1).values as ExcelJS.CellValue[])
      .slice(1)
      .map((v) => String(v ?? "").trim());
    rows = [];
    for (let i = 2; i <= Math.min(sheet.rowCount, MAX_IMPORT_ROWS + 2); i++) {
      const row = sheet.getRow(i);
      if (!row.hasValues) continue;
      rows.push(
        Object.fromEntries(
          headers.map((header, col) => [
            header,
            String(row.getCell(col + 1).text ?? "").trim(),
          ]),
        ),
      );
    }
  }
  if (rows.length > MAX_IMPORT_ROWS)
    throw new AppError(
      "VALIDATION",
      `Maximum ${MAX_IMPORT_ROWS} rows per import`,
      400,
    );
  if (!rows.length)
    throw new AppError("VALIDATION", "File has no data rows", 400);
  return rows;
}
