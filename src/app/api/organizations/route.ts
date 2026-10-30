import { z } from "zod";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createPilotOrganization } from "@/services/onboarding";
const schema = z.object({
  name: z.string().min(3).max(180),
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  email: z.email(),
  password: z.string().min(10).max(100),
});
export const POST = api(
  async (request, actor) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      throw new AppError(
        "VALIDATION",
        "Enter a name, URL slug, owner email, and strong password",
      );
    const result = await createPilotOrganization(actor, parsed.data);
    return Response.json({
      id: result.organization.id,
      slug: result.organization.slug,
      email: result.owner.email,
    });
  },
  "settings:write",
  true,
);
