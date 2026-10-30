import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/security";
import { errorResponse } from "@/lib/errors";
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { locale } = await request.json();
    if (!["sr-Latn", "en", "ru"].includes(locale))
      return Response.json({ error: "Invalid locale" }, { status: 400 });
    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      `otprema_locale=${locale}; Path=/; SameSite=Lax; Max-Age=31536000`,
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
