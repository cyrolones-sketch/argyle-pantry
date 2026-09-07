CREATE TABLE IF NOT EXISTS submissions (
  reference TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('order', 'reservation')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  owner_email_id TEXT,
  receipt_email_id TEXT,
  response TEXT
);
CREATE INDEX IF NOT EXISTS submissions_created_at ON submissions(created_at);
