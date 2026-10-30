import { hash } from "bcryptjs";
import { db } from "@/db/client";
import {
  auditEvents,
  integrationConnections,
  organizations,
  users,
} from "@/db/schema";
import type { Actor } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export async function createPilotOrganization(
  actor: Actor,
  input: { name: string; slug: string; email: string; password: string },
) {
  if (actor.role !== "OWNER")
    throw new AppError(
      "AUTHORIZATION",
      "Only an owner may create a pilot organization",
      403,
    );
  const eotMode = (process.env.EOTPREMNICA_MODE ?? "mock").toUpperCase();
  if (!["MOCK", "SANDBOX", "PRODUCTION"].includes(eotMode))
    throw new AppError("CONFIGURATION", "Unsupported eOtpremnica mode", 503);
  return db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name: input.name, slug: input.slug })
      .returning();
    const [owner] = await tx
      .insert(users)
      .values({
        organizationId: organization.id,
        name: "Pilot owner",
        email: input.email.toLowerCase(),
        role: "OWNER",
        passwordHash: await hash(input.password, 12),
      })
      .returning();
    await tx.insert(integrationConnections).values([
      {
        organizationId: organization.id,
        kind: "CSV",
        name: "CSV / Excel import",
        mode: "LOCAL",
        state: "CONNECTED",
      },
      {
        organizationId: organization.id,
        kind: "EOTPREMNICA",
        name: "eOtpremnica",
        mode: eotMode,
        state: eotMode === "MOCK" ? "CONNECTED" : "LIMITED",
      },
      {
        organizationId: organization.id,
        kind: "SEF",
        name: "SEF / eFaktura",
        mode: "UNCONFIGURED",
        state: "LIMITED",
      },
    ]);
    await tx.insert(auditEvents).values({
      organizationId: organization.id,
      actorId: null,
      action: "organization.created",
      entityType: "organization",
      entityId: organization.id,
      summary: `Pilot organization created by consultant ${actor.email}`,
      correlationId: crypto.randomUUID(),
    });
    return { organization, owner };
  });
}
