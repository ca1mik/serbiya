import { NextRequest } from "next/server";
import { compare } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { loginAttempts, sessions, users } from "@/db/schema";
import { AppError, errorResponse } from "@/lib/errors";
import { assertSameOrigin, hashToken, newToken } from "@/lib/security";
import { z } from "zod";

const input = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const data = input.parse(await request.json());
    const key = hashToken(data.email.toLowerCase());
    const [rate] = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.key, key))
      .limit(1);
    if (
      rate &&
      rate.windowStartedAt.getTime() > Date.now() - 15 * 60_000 &&
      rate.attempts >= 10
    )
      throw new AppError(
        "AUTHORIZATION",
        "Too many sign-in attempts. Try again later.",
        429,
      );
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1);
    if (!user || !(await compare(data.password, user.passwordHash))) {
      await db
        .insert(loginAttempts)
        .values({ key, attempts: 1 })
        .onConflictDoUpdate({
          target: loginAttempts.key,
          set: {
            attempts: sql`case when ${loginAttempts.windowStartedAt} < now() - interval '15 minutes' then 1 else ${loginAttempts.attempts} + 1 end`,
            windowStartedAt: sql`case when ${loginAttempts.windowStartedAt} < now() - interval '15 minutes' then now() else ${loginAttempts.windowStartedAt} end`,
          },
        });
      throw new AppError("AUTHORIZATION", "Invalid email or password", 401);
    }
    await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
    const token = newToken();
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    });
    const response = Response.json({
      user: { name: user.name, role: user.role },
    });
    response.headers.append(
      "Set-Cookie",
      `otprema_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch (error) {
    return errorResponse(
      error instanceof z.ZodError
        ? new AppError("VALIDATION", "Enter a valid email and password")
        : error,
    );
  }
}
