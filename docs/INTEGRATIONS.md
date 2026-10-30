# Integration boundaries

## eOtpremnica

The interface is `EotpremnicaAdapter` in `src/integrations/eotpremnica/types.ts`. The working implementation is `MockEotpremnicaAdapter` in `src/integrations/eotpremnica/adapters.ts`. `SandboxEotpremnicaAdapter` and `ProductionEotpremnicaAdapter` are explicit skeletons in the same file. The environment switch is `getEotpremnicaAdapter()` there. `src/integrations/eotpremnica/xml.ts` serializes only the internal `otpremaops-demo-v1` XML schema. It is **not** official Serbian UBL/XML and must not be presented as compliant.

Before connecting to the real service:

1. Obtain current official eOtpremnica API documentation, XML/UBL/XSD fixtures, authentication method, endpoint list, sandbox credentials, production credentials, and operational error codes from the responsible Serbian authority.
2. Map `Shipment` to `EotpremnicaDocumentDTO` in `src/services/shipment.ts`, then replace/adapt the serializer in `src/integrations/eotpremnica/xml.ts` using verified fixtures. Keep DTO and transport separate.
3. Implement all adapter operations in `SandboxEotpremnicaAdapter`, including validation, submission, status lookup, document retrieval, changes, cancellation if supported, payload download, and health check. Add conformance tests for exact fixtures.
4. Verify request idempotency behavior and reconciliation rules before implementing `ProductionEotpremnicaAdapter`. The queue in `src/jobs/queue.ts` must map real retryable/non-retryable errors and pending states.
5. Store credentials through a secret abstraction using `SECRET_ENCRYPTION_KEY` or a deployment secret manager. Never store cleartext keys in `integration_connections`, payloads, logs, or client props.
6. Explicitly set `EOTPREMNICA_MODE=sandbox` for sandbox tests and `production` only after sign-off. No fallback to mock exists.

The mock response IDs all begin with `mock-`. The UI displays `DEMO / MOCK` when mock mode is active. Any seeded accepted document is a mock result, never a government acknowledgement.

## Source systems

`src/integrations/import/contracts.ts` defines CSV, XLSX, REST, SQL, SFTP, and Legacy ERP source shapes. CSV and XLSX parsing is implemented in `src/integrations/import/parser.ts`; mapped import transactions live in `src/services/imports.ts`. Rows with the same shipment number or external ID become lines in one shipment, provided their non-empty shared fields agree. Every line must include one of those identifiers. The Legacy ERP demo is seeded data only. A future SQL connector must use a dedicated read-only database account, fixed parameterized query templates, a narrow allowlist of tables/views, environment or secret-manager credentials, and no arbitrary SQL from ordinary users. REST and SFTP connectors require authentication, pagination/checkpoint rules, and sync history before activation.

## SEF

`src/integrations/sef/adapter.ts` contains `SefAdapter` and `MockSefAdapter`. There is no invoice submission. A later invoice reference can link an accepted dispatch to a SEF document without changing the shipment core.
