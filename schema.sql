-- Test 3 schema for the D1 binding used by /api/submissions.
-- Apply with:  wrangler d1 execute <DB_NAME> --local --file=./schema.sql
-- (and again with --remote for production)

CREATE TABLE IF NOT EXISTS submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
