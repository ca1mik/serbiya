import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shipments, validationIssues } from "@/db/schema";
import { requireActor, rolePermissions } from "@/lib/auth";
import { ExceptionActions } from "@/components/ExceptionActions";
import { serverUiText } from "@/i18n/server";
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const actor = await requireActor();
  const t = await serverUiText();
  const filters = await searchParams;
  const rows = await db
    .select({ issue: validationIssues, shipment: shipments })
    .from(validationIssues)
    .leftJoin(
      shipments,
      and(
        eq(validationIssues.shipmentId, shipments.id),
        eq(shipments.organizationId, actor.organizationId),
      ),
    )
    .where(
      and(
        eq(validationIssues.organizationId, actor.organizationId),
        eq(
          validationIssues.status,
          filters.status === "resolved" ? "RESOLVED" : "OPEN",
        ),
      ),
    )
    .orderBy(desc(validationIssues.createdAt))
    .limit(200);
  const issues = filters.category
    ? rows.filter((x) => x.issue.category === filters.category)
    : rows;
  const canAct = (rolePermissions[actor.role] as readonly string[]).includes(
    "shipment:write",
  );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("ZAHTEVA LJUDSKU ODLUKU")}</div>
          <h1>{t("Greške")}</h1>
          <p>
            {issues.length}{" "}
            {t(
              "stavki za pregled. Tehnički detalji su dostupni u svakom zapisu.",
            )}{" "}
          </p>
        </div>
        <Link className="button subtle" href="/exceptions?status=resolved">
          {t("Zatvorene greške")}{" "}
        </Link>
      </div>
      <div className="filter-links">
        <Link href="/exceptions">{t("Sve")}</Link>
        <Link href="/exceptions?category=INTERNAL_REQUIRED">{t("Podaci")}</Link>
        <Link href="/exceptions?category=INTEGRATION_REQUIRED">
          {t("Integracija")}{" "}
        </Link>
        <Link href="/exceptions?category=GOVERNMENT_REJECTION">
          {t("Odbijeno")}
        </Link>
      </div>
      <section className="exception-list">
        {issues.map(({ issue, shipment }) => (
          <article key={issue.id} className="exception-card">
            <div className="exception-main">
              <div className="exception-title">
                <span
                  className={`severity severity-${issue.severity.toLowerCase()}`}
                >
                  {t(issue.severity)}
                </span>
                <strong>{t(issue.explanation)}</strong>
              </div>
              <div className="exception-meta">
                <span>{t(issue.category)}</span>
                <span>·</span>
                {shipment ? (
                  <Link href={`/shipments/${shipment.id}`}>
                    {shipment.number}
                  </Link>
                ) : (
                  t("Bez otpremnice")
                )}
                <span>·</span>
                <span>{issue.createdAt.toLocaleString("sr-RS")}</span>
                <span>·</span>
                <span>
                  {issue.attemptCount} {t("pokušaja")}
                </span>
                <span>·</span>
                <span>
                  {t("Vlasnik:")}{" "}
                  {issue.ownerId
                    ? issue.ownerId.slice(0, 8)
                    : t("Neraspoređeno")}
                </span>
                <span>·</span>
                <span>
                  {t("Status:")} {t(issue.status)}
                </span>
              </div>
              {issue.lastRetryAt && (
                <p>
                  {t("Poslednji pokušaj:")}{" "}
                  {issue.lastRetryAt.toLocaleString("sr-RS")}
                </p>
              )}
              <p>
                {t("Preporuka:")} {t(issue.recommendedAction)}
              </p>
              {issue.resolutionReason && (
                <p>
                  {t("Razrešenje:")} {t(issue.resolutionReason)}
                </p>
              )}
              <details>
                <summary>{t("Tehnički detalji")}</summary>
                <pre>
                  {issue.code}
                  {issue.technicalDetail ? `\n${issue.technicalDetail}` : ""}
                </pre>
              </details>
            </div>
            {canAct && issue.status === "OPEN" && (
              <ExceptionActions
                id={issue.id}
                requestId={issue.requestId}
                code={issue.code}
              />
            )}
          </article>
        ))}
        {issues.length === 0 && (
          <div className="empty-state">
            {t("Nema grešaka za izabrani filter.")}
          </div>
        )}
      </section>
    </>
  );
}
