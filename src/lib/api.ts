import { NextRequest } from "next/server";
import { requireActor, type Permission } from "./auth";
import { errorResponse } from "./errors";
import { assertSameOrigin } from "./security";

export function api(
  handler: (
    request: NextRequest,
    actor: Awaited<ReturnType<typeof requireActor>>,
  ) => Promise<Response>,
  permission: Permission = "read",
  mutation = false,
) {
  return async (request: NextRequest) => {
    try {
      if (mutation) assertSameOrigin(request);
      const actor = await requireActor(permission);
      return await handler(request, actor);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
