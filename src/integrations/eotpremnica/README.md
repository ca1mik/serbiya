# eOtpremnica adapter handoff

`MockEotpremnicaAdapter` in `adapters.ts` is the only operational adapter in this MVP. It returns IDs prefixed with `mock-` and never calls a Serbian government service. `SandboxEotpremnicaAdapter` and `ProductionEotpremnicaAdapter` fail explicitly until implemented; `getEotpremnicaAdapter()` selects exactly the `EOTPREMNICA_MODE` configured on the server.

The contract is `EotpremnicaAdapter` and `EotpremnicaDocumentDTO` in `types.ts`. `xml.ts` serializes an internal `otpremaops-demo-v1` XML document. It is not an official UBL/eOtpremnica schema or a legal validation implementation.

To connect the real service:

1. Obtain current official API documentation, authentication and credential requirements, sandbox endpoints, XML/UBL/XSD examples, status and error codes, and idempotency rules from the responsible authority.
2. Map the persisted shipment and lines to the verified DTO in `src/services/shipment.ts`. Update `types.ts` and replace the demo serializer in `xml.ts` using official conformance fixtures. Keep serialization independent of transport.
3. Implement validation, submission, status lookup, document retrieval, changes, cancellation where supported, payload download, and health in `SandboxEotpremnicaAdapter` in `adapters.ts`.
4. Add fixture and sandbox tests for exact payloads, authentication, accepted and rejected results, transient faults, retries, and duplicate submissions. Map real responses into `src/jobs/queue.ts` without losing request history.
5. Supply credentials through a deployment secret manager or an encrypted server-side secret abstraction. Never write them to payload inspection, logs, audit metadata, or client props.
6. Implement `ProductionEotpremnicaAdapter` only after sandbox conformance and operational sign-off. Set `EOTPREMNICA_MODE=production` explicitly; no fallback to mock exists.

See `docs/INTEGRATIONS.md` and `docs/SECURITY.md` for the broader integration and deployment boundaries.
