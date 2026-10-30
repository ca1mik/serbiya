import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  role: z.enum([
    "OWNER",
    "ADMIN",
    "OPERATIONS",
    "WAREHOUSE",
    "ACCOUNTING",
    "VIEWER",
  ]),
  password: z.string().min(10).max(100),
});
export const POST = api(
  async (request, actor) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      throw new AppError(
        "VALIDATION",
        "Enter valid user details and a 10-character password",
      );
    const [user] = await db
      .insert(users)
      .values({
        organizationId: actor.organizationId,
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        passwordHash: await hash(parsed.data.password, 12),
      })
      .returning();
    await db.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "user.created",
      entityType: "user",
      entityId: user.id,
      summary: `${user.name} (${user.role})`,
      correlationId: crypto.randomUUID(),
    });
    return Response.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  },
  "settings:write",
  true,
);
