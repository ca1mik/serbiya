import fs from "node:fs";
import ExcelJS from "exceljs";
const csv = fs.readFileSync("examples/imports/valid_shipments.csv", "utf8");
const book = new ExcelJS.Workbook();
const sheet = book.addWorksheet("Otpremnice");
for (const line of csv.trim().split(/\r?\n/))
  sheet.addRow(
    line
      .match(/(?:"(?:[^"]|"")*"|[^,])+/g)
      ?.map((cell) => cell.replace(/^"|"$/g, "")) ?? [],
  );
await book.xlsx.writeFile("examples/imports/valid_shipments.xlsx");
