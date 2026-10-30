# Security and operations notes

## Implemented

- HTTP-only same-site session cookies; session tokens stored as SHA-256 hashes; bcrypt password hashes.
- PostgreSQL-backed per-email login attempt limit (10 attempts per 15 minutes).
- Server-side role checks and organization-scoped queries/mutations for business records.
- Same-origin check for mutation requests, Zod input validation, upload size/row limits, filename allowlist, ExcelJS XLSX parsing, no XML parsing/XXE surface, parameterized Drizzle/pg SQL.
- Secrets are not serialized to the client. `safeJson` masks token/key/password fields in raw payload inspection.
- Security headers for framing, MIME sniffing, referrer, and browser permissions.
- Append-only audit table guarded by a PostgreSQL trigger.
- Mock/production mode separation. Production adapter does not silently send simulated responses.

## Required before internet-facing production

- Extend rate limiting to sensitive mutation endpoints and trusted proxy IP signals; add account lockout and password reset or SSO.
- Replace all demo accounts and seed data. Add email verification/invitations for new user creation.
- Encrypt persisted integration credentials or use a secret manager; rotate keys. The current adapter stores no real credentials.
- Add PostgreSQL RLS or composite tenant foreign keys as defense in depth; test all new repository queries.
- Add worker lease recovery, queue dead-letter review, backup/restore tests, and monitoring.
- Configure HTTPS, secure proxy headers, CSP suitable for deployment, and dependency audit in CI.
- Decide retention/redaction for source payloads, responses, operational records, and audit data with counsel and customers. Avoid inventing legal retention periods.

## Dependency audit

Run `pnpm audit` during upgrades and before deployment. The project pins the patched Next.js 16.3.6 line available when this MVP was created. Re-check advisories before exposure.
