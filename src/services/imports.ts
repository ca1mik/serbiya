import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  customers,
  importJobs,
  importRows,
  mappingTemplates,
  organizations,
  shipmentLines,
  shipments,
} from "@/db/schema";
import {
  groupMappedRows,
  mapRow,
  mappingSchema,
  type Mapping,
} from "@/domain/mapping";
import type { Actor } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { recordProductEvent } from "@/lib/product-events";

export async function importShipments(
  actor: Actor,
  filename: string,
  rows: Record<string, string>[],
  mapping: Mapping,
  templateName?: string,
) {
  if (!rows.length || rows.length > 500)
    throw new AppError("VALIDATION", "Import must have between 1 and 500 rows");
  if (!mappingSchema.safeParse(mapping).success)
    throw new AppError(
      "VALIDATION",
      "Each destination can be mapped only once",
    );
  const headers = new Set(Object.keys(rows[0]));
  if (Object.keys(mapping).some((header) => !headers.has(header)))
    throw new AppError(
      "VALIDATION",
      "Mapping contains an unknown source column",
    );
  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  if (!organization)
    throw new AppError("NOT_FOUND", "Organization not found", 404);
  const correlationId = randomUUID();
  const mapped = rows.map((row) => mapRow(row, mapping));
  const groups = groupMappedRows(mapped);
  const source = filename.toLowerCase().endsWith(".xlsx") ? "XLSX" : "CSV";
  const [job] = await db
    .insert(importJobs)
    .values({
      organizationId: actor.organizationId,
      filename,
      source,
      status: "PROCESSING",
      totalRows: rows.length,
      correlationId,
      createdBy: actor.id,
    })
    .returning();
  await recordProductEvent({
    name: "import_started",
    organizationId: actor.organizationId,
    actorId: actor.id,
    entityId: job.id,
    entityType: "import",
    correlationId,
    properties: { filename, rows: rows.length },
  });
  let imported = 0,
    errors = 0,
    importedShipments = 0;
  for (const group of groups) {
    const row = group.shipment;
    const rowErrors = [...group.errors];
    const externalId = row.externalId || row.number;
    const existing = await db
      .select({ id: shipments.id })
      .from(shipments)
      .where(
        and(
          eq(shipments.organizationId, actor.organizationId),
          or(
            eq(shipments.number, row.number || externalId),
            and(
              eq(shipments.source, source),
              eq(shipments.externalId, externalId),
            ),
          ),
        ),
      )
      .limit(1);
    if (existing[0]) rowErrors.push("Duplicate external shipment ID");
    if (rowErrors.length) {
      errors += group.rowIndexes.length;
      const message = rowErrors.join("; ").slice(0, 1000);
      await db.insert(importRows).values(
        group.rowIndexes.map((index) => ({
          organizationId: actor.organizationId,
          importJobId: job.id,
          rowNumber: index + 2,
          sourceData: rows[index],
          error: message,
        })),
      );
      continue;
    }
    try {
      await db.transaction(async (tx) => {
        let customer = (
          await tx
            .select()
            .from(customers)
            .where(
              and(
                eq(customers.organizationId, actor.organizationId),
                eq(customers.name, row.recipientName),
              ),
            )
            .limit(1)
        )[0];
        if (!customer)
          customer = (
            await tx
              .insert(customers)
              .values({
                organizationId: actor.organizationId,
                name: row.recipientName,
                taxId: row.recipientTaxId || null,
                address: row.destination || null,
              })
              .returning()
          )[0];
        const shipmentCorrelation = randomUUID();
        const [shipment] = await tx
          .insert(shipments)
          .values({
            organizationId: actor.organizationId,
            number: row.number || row.externalId,
            externalId,
            source,
            customerId: customer.id,
            recipientName: row.recipientName,
            recipientTaxId: row.recipientTaxId || null,
            destination: row.destination || null,
            senderName: row.senderName || organization.name,
            shipFrom: row.shipFrom || null,
            plannedAt: row.plannedAt ? new Date(row.plannedAt) : null,
            transport: row.transport || null,
            status: "IMPORTED",
            sourceData:
              group.rowIndexes.length === 1
                ? rows[group.rowIndexes[0]]
                : {
                    rows: group.rowIndexes.map((index) => ({
                      rowNumber: index + 2,
                      data: rows[index],
                    })),
                  },
            importJobId: job.id,
            correlationId: shipmentCorrelation,
          })
          .returning();
        await tx.insert(shipmentLines).values(
          group.lines.map((line) => ({
            organizationId: actor.organizationId,
            shipmentId: shipment.id,
            sku: line.sku,
            description: line.description || line.sku,
            quantity: line.quantity.replace(",", "."),
            sourceUnit: line.unit,
            sourceReference: externalId,
          })),
        );
        await tx.insert(importRows).values(
          group.rowIndexes.map((index) => ({
            organizationId: actor.organizationId,
            importJobId: job.id,
            rowNumber: index + 2,
            sourceData: rows[index],
            shipmentId: shipment.id,
          })),
        );
        await tx.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorId: actor.id,
          action: "shipment.created",
          entityType: "shipment",
          entityId: shipment.id,
          summary: "Shipment imported",
          correlationId: shipmentCorrelation,
          metadata: {
            importJobId: job.id,
            rowNumbers: group.rowIndexes.map((index) => index + 2),
          },
        });
      });
      imported += group.rowIndexes.length;
      importedShipments++;
    } catch (error) {
      errors += group.rowIndexes.length;
      await db.insert(importRows).values(
        group.rowIndexes.map((index) => ({
          organizationId: actor.organizationId,
          importJobId: job.id,
          rowNumber: index + 2,
          sourceData: rows[index],
          error:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Could not import shipment",
        })),
      );
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .update(importJobs)
      .set({
        status: errors ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        importedRows: imported,
        errorRows: errors,
      })
      .where(
        and(
          eq(importJobs.id, job.id),
          eq(importJobs.organizationId, actor.organizationId),
        ),
      );
    if (templateName)
      await tx.insert(mappingTemplates).values({
        organizationId: actor.organizationId,
        name: templateName,
        source,
        mapping,
        active: true,
      });
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "import.completed",
      entityType: "import",
      entityId: job.id,
      summary: `${imported} rows imported, ${errors} errors`,
      correlationId,
      metadata: { imported, importedShipments, errors },
    });
  });
  const failedRows = await db
    .select({ rowNumber: importRows.rowNumber, error: importRows.error })
    .from(importRows)
    .where(
      and(
        eq(importRows.organizationId, actor.organizationId),
        eq(importRows.importJobId, job.id),
      ),
    );
  await recordProductEvent({
    name: "import_completed",
    organizationId: actor.organizationId,
    actorId: actor.id,
    entityId: job.id,
    entityType: "import",
    correlationId,
    properties: { imported, importedShipments, errors },
  });
  return {
    id: job.id,
    imported,
    importedShipments,
    errors,
    correlationId,
    rowErrors: failedRows.filter((row) => row.error),
  };
}
