import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mappingTemplates, unitMappings } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { MappingManager } from "@/components/MappingManager";
import { serverUiText } from "@/i18n/server";
export default async function MappingsPage() {
  const t = await serverUiText();
  const actor = await requireActor("mapping:write");
  const [units, templates] = await Promise.all([
    db
      .select()
      .from(unitMappings)
      .where(eq(unitMappings.organizationId, actor.organizationId)),
    db
      .select()
      .from(mappingTemplates)
      .where(eq(mappingTemplates.organizationId, actor.organizationId)),
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("USKLAĐIVANJE PODATAKA")}</div>
          <h1>{t("Mapiranja")}</h1>
          <p>{t("Pravila za uvoz i jedinice mere koja nedostaju.")}</p>
        </div>
      </div>
      <MappingManager initialUnits={units} templates={templates} />
    </>
  );
}
