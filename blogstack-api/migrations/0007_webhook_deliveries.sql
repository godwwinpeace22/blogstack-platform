-- Migration 0007: Webhook delivery history
-- The ingest worker records every delivery attempt here. Keeping the timestamp
-- as `delivered_at` matches the delivery contract and supports failed-attempt
-- inspection and future replay tooling.

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id      TEXT    NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event           TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK(status IN ('delivered', 'failed')),
  response_status INTEGER,
  attempt_number  INTEGER NOT NULL,
  delivered_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_time
  ON webhook_deliveries(webhook_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_failed
  ON webhook_deliveries(status, delivered_at DESC)
  WHERE status = 'failed';
