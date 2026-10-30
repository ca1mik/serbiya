# OtpremaOps

OtpremaOps is a Serbian SME shipment operations layer. It imports CSV/XLSX exports from existing systems, normalizes and validates shipments, prepares an internal demo dispatch payload, queues mock eOtpremnica submissions, tracks asynchronous outcomes, and makes failures actionable. The main screen is an attention queue.

It is **not** an ERP, CRM, accounting product, WMS, TMS, SEF replacement, or production eOtpremnica client. **Mock mode does not communicate with Serbian government systems.** All seeded companies, IDs, and documents are fictional demo data. `DEMO-PIB-*` values are intentionally invalid for production.

## Stack and architecture

Next.js 16.3.6, React 19, strict TypeScript, PostgreSQL 17, Drizzle ORM, Zod, TanStack Table, ExcelJS, Decimal.js, a PostgreSQL job queue, Vitest, Playwright, and Docker Compose. UI styles use centralized CSS tokens and restrained operational components. See [architecture](docs/ARCHITECTURE.md), [integration boundary](docs/INTEGRATIONS.md), and [security notes](docs/SECURITY.md).

## Prerequisites

- Docker Desktop with Compose, or Node.js 24+, pnpm 10+, and PostgreSQL 17+
- For browser tests: `pnpm exec playwright install chromium`

## Quick start with Docker

```sh
cp .env.example .env
docker compose up --build
```

On Windows PowerShell, use `Copy-Item .env.example .env`. Compose starts PostgreSQL, applies migrations, seeds two organizations, starts the app on http://localhost:3000, and starts the worker. PostgreSQL stays on Compose's private network; it does not occupy port 5432 on the host. The seed is idempotent at the organization level. The app container becomes healthy when `/api/ready` confirms both PostgreSQL and a worker heartbeat.

For any non-demo deployment, replace `AUTH_SECRET` and `SECRET_ENCRYPTION_KEY` in `.env`. Keep `.env` out of source control. The current MVP does not yet persist integration secrets; the key reserves the boundary for later encrypted storage.

If the app is still starting, inspect `docker compose ps` and `docker compose logs init app worker`. The first launch applies migrations and inserts demo data before the app and worker start.

## Local development without Compose

Set `DATABASE_URL` in `.env` to a local PostgreSQL database and start PostgreSQL. Then:

```sh
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev:all
```

`pnpm dev` starts only the web app. `pnpm worker` starts only the asynchronous worker. `pnpm dev:all` starts both. Database migrations live in `drizzle/`. The seed script creates 120 Dunav demo shipments and 5 shipments in a second tenant.

## Demo accounts

| Organization | Email | Password | Role |
| --- | --- | --- | --- |
| Dunav Distribucija d.o.o. (DEMO) | `owner@dunav.demo.invalid` | `Demo1234!` | OWNER |
| Dunav Distribucija d.o.o. (DEMO) | `admin@dunav.demo.invalid` | `Demo1234!` | ADMIN |
| Dunav Distribucija d.o.o. (DEMO) | `operations@dunav.demo.invalid` | `Demo1234!` | OPERATIONS |
| Dunav Distribucija d.o.o. (DEMO) | `warehouse@dunav.demo.invalid` | `Demo1234!` | WAREHOUSE |
| Dunav Distribucija d.o.o. (DEMO) | `accounting@dunav.demo.invalid` | `Demo1234!` | ACCOUNTING |
| Dunav Distribucija d.o.o. (DEMO) | `viewer@dunav.demo.invalid` | `Demo1234!` | VIEWER |
| Drugi Pilot d.o.o. (DEMO) | `owner@drugi.demo.invalid` | `Demo1234!` | OWNER |

Change all demo passwords before any shared deployment.

## Workflow

1. Open **Operacije** to see attention ordered by explicit rules.
2. Open a **Potrebni podaci** shipment and fix the field or unit mapping.
3. Run **Proveri**, **Pripremi dokument**, then **Pošalji**.
4. The worker records a request ID, polls the mock adapter, then marks it accepted or rejected.
5. Inspect the shipment tabs for events, source and outbound payloads, XML, and audit history.
6. Open **Greške** to resolve validation failures or retry transient integration failures.
7. Open **Uvozi**, upload a sample CSV/XLSX from `examples/imports/`, map columns, optionally save the template, and import valid rows. Rows with the same shipment number or external ID become product lines of one shipment; conflicting shared fields block that shipment.

The failure fixture includes missing recipient tax ID, missing destination/unit mapping, and `SKU-DEMO-FAIL`, which deterministically causes mock rejection. `Demo Timeout Kupac` times out on its first mock submission attempt and then succeeds on retry.

## Pilot onboarding

An OWNER can create a new pilot organization in **Podešavanja**. Sign in as its new owner, create locations and users, select a CSV/XLSX file in **Uvozi**, map its columns, save a template, and import. This is a local consultant path. Email verification and invitations are not implemented.

## Commands

```sh
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm worker
pnpm dev:all
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm test` runs domain tests everywhere. Database integration tests run only when `TEST_DATABASE_URL` is explicitly set to a separate, migrated test database; application `DATABASE_URL` is not used for test writes. Those tests create records. `pnpm test:e2e` requires a seeded running app and worker at `APP_URL`, plus Playwright Chromium. Browser tests use unique sample shipment numbers and run serially; point them only at an isolated demo/test app.

`pnpm build` uses Next.js's supported Webpack compiler for consistent builds on Windows workspaces and in Docker.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | Browser origin for same-origin mutation checks |
| `DEMO_LOCALE` | Optional local default UI locale: `sr-Latn`, `en`, or `ru`; product default is Serbian Latin |
| `AUTH_SECRET` | Reserved for future auth key rotation/session signing |
| `SECRET_ENCRYPTION_KEY` | Reserved for encrypted integration credentials |
| `EOTPREMNICA_MODE` | `mock`, `sandbox`, or `production` |
| `EOTPREMNICA_BASE_URL`, `EOTPREMNICA_API_KEY` | Future verified adapter configuration |
| `MOCK_DELAY_MS` | Mock processing delay |
| `SEF_MODE`, `SEF_BASE_URL`, `SEF_API_KEY` | Future SEF adapter configuration |

`sandbox` and `production` have explicit skeleton adapters. They fail with a configuration/implementation error. They never silently use mock behavior. See [integration documentation](docs/INTEGRATIONS.md) for the exact handoff.

## Health and observability

`/api/health` reports web process health. `/api/ready` requires PostgreSQL and a worker heartbeat within 30 seconds. Queue attempts, request payloads, responses, validation issues, and audit events are persisted. Logs are structured JSON on the worker path. Correlation IDs connect import jobs, shipments, documents, requests, and audit events.

## Current limitations

- The government adapter uses internal mock XML, not an official UBL/eOtpremnica schema. Production and sandbox mapping require current official documentation, credentials, and conformance tests.
- REST, SQL, and SFTP source connectors are contracts only. The fake Legacy ERP uses seed data. SEF is a mock boundary without invoice submission.
- Multi-line CSV/XLSX imports require a repeated shipment number or external ID on every row. A real pilot export still needs format-specific validation and mapping.
- Local password authentication has no email verification, password reset, or SSO. Login has a PostgreSQL-backed per-email limit; broader endpoint limits are planned before internet exposure.
- Worker leases are simple PostgreSQL rows with stale-job recovery. External request reconciliation and distributed worker coordination are needed before scaling workers horizontally.
- No third-party analytics are sent. Internal events are represented by audit/integration records; a dedicated analytics sink can be added later.
- Serbian Latin, English, and Russian operational UI copy are available. Imported column names, customer data, technical codes, and some upstream error messages stay in their source language.

## Production checklist

1. Replace demo accounts, passwords, tax IDs, and fixtures; separate demo and production databases.
2. Obtain and verify current official eOtpremnica API docs, schema, sandbox access, and certificates/keys.
3. Implement sandbox/production adapters and official serializer with conformance fixtures; verify idempotency semantics.
4. Add rate limiting, password reset or SSO, secret encryption/key rotation, backup/restore, and incident runbooks.
5. Enforce HTTPS, correct `APP_URL`, cookie security, retention periods, logging redaction, and monitoring.
6. Run `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, dependency audit, and a fresh Compose smoke test.

See [the seven-minute demo](docs/DEMO.md).

## Market and pilot materials

The [market decision](docs/MARKET_DECISION.md), [technical pilot gates](docs/TECHNICAL_PLAN.md), [Serbian proposal draft](docs/OFFER_SR.md), and [public work contacts](docs/CONTACTS.md) were checked on 28 September 2026. The proposal is a draft; no prospect has been contacted.
