-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
ALTER TABLE shipments ADD CONSTRAINT shipment_status_valid CHECK (status IN ('DRAFT','IMPORTED','NEEDS_DATA','READY','QUEUED','SUBMITTING','SUBMITTED','ACCEPTED','REJECTED','FAILED_TRANSIENT','CANCELLED','DELIVERED'));
ALTER TABLE integration_requests ADD CONSTRAINT request_state_valid CHECK (state IN ('QUEUED','SUBMITTING','PROCESSING','ACCEPTED','REJECTED','FAILED_TRANSIENT'));
