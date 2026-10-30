import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shipments } from "@/db/schema";
import { ShipmentsTable } from "@/components/ShipmentsTable";
import { serverUiText } from "@/i18n/server";
import { requireActor, rolePermissions } from "@/lib/auth";
export default async function ShipmentsPage() {
  const actor = await requireActor();
  const canEdit = (rolePermissions[actor.role] as readonly string[]).includes("shipment:write");
  const canImport = (rolePermissions[actor.role] as readonly string[]).includes("import:write");
  const sourceRows = await db.selectDistinct({ source: shipments.source }).from(shipments)
    .where(eq(shipments.organizationId, actor.organizationId));
  const t = await serverUiText();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("EVIDENCIJA ROBE")}</div>
          <h1>{t("Otpremnice")}</h1>
          <p>{t("Pretraga, provera i kontrolisano slanje.")}</p>
        </div>
        {canImport && (
          <Link href="/imports" className="button primary">
            {t("+ Uvezi otpremnice")}
          </Link>
        )}
      </div>
      <section className="work-panel table-panel">
        <ShipmentsTable canEdit={canEdit} filterScope={actor.organizationId} sources={sourceRows.map((row) => row.source)} />
      </section>
    </>
  );
}
