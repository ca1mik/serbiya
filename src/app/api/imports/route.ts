import { z } from "zod";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { mappingSchema } from "@/domain/mapping";
import { importShipments } from "@/services/imports";
const schema = z.object({
  filename: z
    .string()
    .regex(/^[\w .()\-\p{L}]+\.(csv|xlsx)$/iu)
    .max(180),
  rows: z
    .array(z.record(z.string().max(100), z.string().max(1000)))
    .min(1)
    .max(500),
  mapping: mappingSchema,
  templateName: z.string().max(100).optional(),
});
export const POST = api(
  async (request, actor) => {
    const result = schema.safeParse(await request.json());
    if (!result.success)
      throw new AppError("VALIDATION", "Invalid import data");
    return Response.json(
      await importShipments(
        actor,
        result.data.filename,
        result.data.rows,
        result.data.mapping,
        result.data.templateName,
      ),
    );
  },
  "import:write",
  true,
);
