import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { currentActor } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { serverLocale } from "@/i18n/server";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  const locale = await serverLocale();
  return (
    <AppShell
      user={{
        name: actor.name,
        role: actor.role,
        organization: organization?.name ?? "Organization",
      }}
      locale={locale}
      mode={process.env.EOTPREMNICA_MODE ?? "mock"}
    >
      {children}
    </AppShell>
  );
}
