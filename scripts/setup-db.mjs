// Creates the tables. Safe to run more than once.  Usage: npm run db:setup
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (put it in .env.local)");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS wait_periods (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    started_by TEXT,
    ended_by TEXT
  )
`;
// Only one wait can be open at a time, even if two people hit Start at the same instant.
await sql`CREATE UNIQUE INDEX IF NOT EXISTS one_active_wait ON wait_periods ((true)) WHERE ended_at IS NULL`;
await sql`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
  )
`;

// Thoughts people post while a wait is running. Deleting a wait deletes its notes.
await sql`
  CREATE TABLE IF NOT EXISTS wait_notes (
    id SERIAL PRIMARY KEY,
    period_id INTEGER NOT NULL REFERENCES wait_periods(id) ON DELETE CASCADE,
    author TEXT,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS wait_notes_period ON wait_notes (period_id)`;

console.log("Database ready.");
