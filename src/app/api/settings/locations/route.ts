import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, locations } from "@/db/schema";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
const schema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().min(4).max(300),
});
export const POST = api(
  async (request, actor) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      throw new AppError("VALIDATION", "Enter a location name and address");
    const [location] = await db
      .insert(locations)
      .values({ organizationId: actor.organizationId, ...parsed.data })
      .returning();
    await db.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "location.created",
      entityType: "location",
      entityId: location.id,
      summary: location.name,
      correlationId: crypto.randomUUID(),
    });
    return Response.json(location);
  },
  "settings:write",
  true,
);
