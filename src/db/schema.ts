import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const org = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  taxId: varchar("tax_id", { length: 40 }),
  createdAt: created(),
});
export const users = pgTable(
  "users",
  {
    id: id(),
    organizationId: org(),
    email: varchar("email", { length: 254 }).notNull(),
    name: text("name").notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_org_idx").on(t.organizationId),
  ],
);
export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const customers = pgTable(
  "customers",
  {
    id: id(),
    organizationId: org(),
    name: text("name").notNull(),
    taxId: varchar("tax_id", { length: 40 }),
    address: text("address"),
    createdAt: created(),
  },
  (t) => [index("customers_org_idx").on(t.organizationId)],
);
export const locations = pgTable("locations", {
  id: id(),
  organizationId: org(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  createdAt: created(),
});
export const products = pgTable(
  "products",
  {
    id: id(),
    organizationId: org(),
    sku: varchar("sku", { length: 100 }).notNull(),
    name: text("name").notNull(),
    defaultUnit: varchar("default_unit", { length: 30 }).notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("products_org_sku_idx").on(t.organizationId, t.sku)],
);
export const unitMappings = pgTable(
  "unit_mappings",
  {
    id: id(),
    organizationId: org(),
    sourceUnit: varchar("source_unit", { length: 40 }).notNull(),
    normalizedUnit: varchar("normalized_unit", { length: 20 }).notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("unit_mappings_org_source_idx").on(
      t.organizationId,
      t.sourceUnit,
    ),
  ],
);
export const mappingTemplates = pgTable(
  "mapping_templates",
  {
    id: id(),
    organizationId: org(),
    name: text("name").notNull(),
    source: varchar("source", { length: 40 }).notNull().default("CSV"),
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [index("mappings_org_idx").on(t.organizationId)],
);
export const importJobs = pgTable(
  "import_jobs",
  {
    id: id(),
    organizationId: org(),
    filename: text("filename").notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    errorRows: integer("error_rows").notNull().default(0),
    correlationId: uuid("correlation_id").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: created(),
  },
  (t) => [index("imports_org_idx").on(t.organizationId)],
);
export const importRows = pgTable(
  "import_rows",
  {
    id: id(),
    organizationId: org(),
    importJobId: uuid("import_job_id")
      .notNull()
      .references(() => importJobs.id),
    rowNumber: integer("row_number").notNull(),
    sourceData: jsonb("source_data").$type<Record<string, unknown>>().notNull(),
    error: text("error"),
    shipmentId: uuid("shipment_id"),
    createdAt: created(),
  },
  (t) => [index("import_rows_job_idx").on(t.importJobId)],
);
export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    organizationId: org(),
    number: varchar("number", { length: 80 }).notNull(),
    externalId: varchar("external_id", { length: 120 }),
    source: varchar("source", { length: 30 }).notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    recipientName: text("recipient_name").notNull(),
    recipientTaxId: varchar("recipient_tax_id", { length: 40 }),
    destination: text("destination"),
    senderName: text("sender_name").notNull(),
    shipFrom: text("ship_from"),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    transport: text("transport"),
    status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
    preparationState: varchar("preparation_state", { length: 20 })
      .notNull()
      .default("PENDING"),
    documentStatus: varchar("document_status", { length: 30 })
      .notNull()
      .default("NONE"),
    validationVersion: integer("validation_version").notNull().default(0),
    sourceData: jsonb("source_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    importJobId: uuid("import_job_id").references(() => importJobs.id),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("shipments_org_number_idx").on(t.organizationId, t.number),
    uniqueIndex("shipments_org_external_idx").on(
      t.organizationId,
      t.source,
      t.externalId,
    ),
    index("shipments_queue_idx").on(t.organizationId, t.status, t.plannedAt),
    index("shipments_customer_idx").on(t.organizationId, t.customerId),
  ],
);
export const shipmentLines = pgTable(
  "shipment_lines",
  {
    id: id(),
    organizationId: org(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id),
    sku: varchar("sku", { length: 100 }).notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    sourceUnit: varchar("source_unit", { length: 40 }).notNull(),
    normalizedUnit: varchar("normalized_unit", { length: 20 }),
    batch: text("batch"),
    weightKg: numeric("weight_kg", { precision: 18, scale: 4 }),
    sourceReference: text("source_reference"),
    createdAt: created(),
  },
  (t) => [index("lines_shipment_idx").on(t.organizationId, t.shipmentId)],
);
export const dispatchDocuments = pgTable(
  "dispatch_documents",
  {
    id: id(),
    organizationId: org(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id),
    version: integer("version").notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    xml: text("xml").notNull(),
    externalDocumentId: text("external_document_id"),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_shipment_version_idx").on(
      t.organizationId,
      t.shipmentId,
      t.version,
    ),
  ],
);
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: id(),
    organizationId: org(),
    kind: varchar("kind", { length: 40 }).notNull(),
    name: text("name").notNull(),
    mode: varchar("mode", { length: 30 }).notNull(),
    state: varchar("state", { length: 30 }).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    itemsProcessed: integer("items_processed").notNull().default(0),
    error: text("error"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("connections_org_kind_idx").on(t.organizationId, t.kind)],
);
export const integrationRequests = pgTable(
  "integration_requests",
  {
    id: id(),
    organizationId: org(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => dispatchDocuments.id),
    operation: varchar("operation", { length: 40 }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestId: text("request_id"),
    state: varchar("state", { length: 30 }).notNull(),
    requestPayload: jsonb("request_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("requests_idempotency_idx").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("requests_state_idx").on(t.state, t.nextRetryAt),
  ],
);
export const integrationEvents = pgTable("integration_events", {
  id: id(),
  organizationId: org(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => integrationRequests.id),
  event: varchar("event", { length: 50 }).notNull(),
  detail: jsonb("detail")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: created(),
});
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    organizationId: org(),
    type: varchar("type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: created(),
  },
  (t) => [index("jobs_due_idx").on(t.status, t.runAt)],
);
export const workerHeartbeats = pgTable("worker_heartbeats", {
  name: varchar("name", { length: 60 }).primaryKey(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const validationIssues = pgTable(
  "validation_issues",
  {
    id: id(),
    organizationId: org(),
    shipmentId: uuid("shipment_id").references(() => shipments.id),
    requestId: uuid("request_id").references(() => integrationRequests.id),
    category: varchar("category", { length: 40 }).notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    explanation: text("explanation").notNull(),
    technicalDetail: text("technical_detail"),
    recommendedAction: text("recommended_action").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    ownerId: uuid("owner_id").references(() => users.id),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastRetryAt: timestamp("last_retry_at", { withTimezone: true }),
    resolutionReason: text("resolution_reason"),
    createdAt: created(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("issues_queue_idx").on(t.organizationId, t.status, t.severity)],
);
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    organizationId: org(),
    actorId: uuid("actor_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: created(),
  },
  (t) => [index("audit_org_time_idx").on(t.organizationId, t.createdAt)],
);
