import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { currentActor } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin, hashToken } from "@/lib/security";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await currentActor();
    const token = request.cookies.get("otprema_session")?.value;
    if (token)
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      "otprema_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
