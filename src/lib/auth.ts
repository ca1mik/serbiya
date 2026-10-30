import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { AppError } from "./errors";
import { hashToken } from "./security";

export const rolePermissions = {
  OWNER: [
    "read",
    "shipment:write",
    "preparation:write",
    "document:send",
    "import:write",
    "mapping:write",
    "integration:write",
    "settings:write",
    "audit:read",
    "payload:read",
  ],
  ADMIN: [
    "read",
    "shipment:write",
    "preparation:write",
    "document:send",
    "import:write",
    "mapping:write",
    "integration:write",
    "settings:write",
    "audit:read",
    "payload:read",
  ],
  OPERATIONS: [
    "read",
    "shipment:write",
    "preparation:write",
    "document:send",
    "import:write",
    "mapping:write",
    "audit:read",
    "payload:read",
  ],
  WAREHOUSE: ["read", "preparation:write"],
  ACCOUNTING: ["read", "audit:read"],
  VIEWER: ["read"],
} as const;
export type Role = keyof typeof rolePermissions;
export type Permission = (typeof rolePermissions)[Role][number];
export type Actor = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
};

export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get("otprema_session")?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const user = rows[0]?.user;
  return user
    ? {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        role: user.role as Role,
      }
    : null;
}
export async function requireActor(
  permission: Permission = "read",
): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new AppError("AUTHORIZATION", "Sign in required", 401);
  if (!(rolePermissions[actor.role] as readonly string[]).includes(permission))
    throw new AppError(
      "AUTHORIZATION",
      "You do not have permission for this action",
      403,
    );
  return actor;
}
