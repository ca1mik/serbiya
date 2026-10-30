import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, mappingTemplates, unitMappings } from "@/db/schema";
import { mappingSchema } from "@/domain/mapping";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { randomUUID } from "node:crypto";
const input = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("unit"),
    sourceUnit: z.string().min(1).max(40),
    normalizedUnit: z.string().min(1).max(20),
  }),
  z.object({
    type: z.literal("template"),
    name: z.string().min(1).max(100),
    mapping: mappingSchema,
  }),
]);
export const GET = api(async (_request, actor) =>
  Response.json({
    units: await db
      .select()
      .from(unitMappings)
      .where(eq(unitMappings.organizationId, actor.organizationId)),
    templates: await db
      .select()
      .from(mappingTemplates)
      .where(eq(mappingTemplates.organizationId, actor.organizationId)),
  }),
);
export const POST = api(
  async (request, actor) => {
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid mapping");
    const correlationId = randomUUID();
    if (parsed.data.type === "unit") {
      const [record] = await db
        .insert(unitMappings)
        .values({
          organizationId: actor.organizationId,
          sourceUnit: parsed.data.sourceUnit,
          normalizedUnit: parsed.data.normalizedUnit,
        })
        .onConflictDoUpdate({
          target: [unitMappings.organizationId, unitMappings.sourceUnit],
          set: { normalizedUnit: parsed.data.normalizedUnit },
        })
        .returning();
      await db.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "mapping.updated",
        entityType: "unit_mapping",
        entityId: record.id,
        summary: `${record.sourceUnit} → ${record.normalizedUnit}`,
        correlationId,
      });
      return Response.json(record);
    }
    const [record] = await db
      .insert(mappingTemplates)
      .values({
        organizationId: actor.organizationId,
        name: parsed.data.name,
        source: "CSV",
        mapping: parsed.data.mapping,
      })
      .returning();
    await db.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "mapping.updated",
      entityType: "mapping_template",
      entityId: record.id,
      summary: `Template ${record.name} created`,
      correlationId,
    });
    return Response.json(record);
  },
  "mapping:write",
  true,
);
