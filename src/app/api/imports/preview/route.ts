import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { parseImportFile } from "@/integrations/import/parser";
export const POST = api(
  async (request) => {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new AppError("VALIDATION", "Choose a CSV or XLSX file");
    const rows = await parseImportFile(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
    );
    return Response.json({
      filename: file.name,
      headers: Object.keys(rows[0]),
      rows,
      totalRows: rows.length,
    });
  },
  "import:write",
  true,
);
