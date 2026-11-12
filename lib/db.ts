import { neon } from "@neondatabase/serverless";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

let client: Sql | null = null;

export function sql(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (url) {
      const db = neon(url);
      client = (strings, ...values) => db(strings, ...values) as Promise<Record<string, unknown>[]>;
    } else if (process.env.NODE_ENV !== "production") {
      client = localSql();
    } else {
      throw new Error("DATABASE_URL is not set");
    }
  }
  return client;
}

// Same tables as scripts/setup-db.mjs; keep the two in sync.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS wait_periods (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    started_by TEXT,
    ended_by TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_active_wait ON wait_periods ((true)) WHERE ended_at IS NULL;
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS wait_notes (
    id SERIAL PRIMARY KEY,
    period_id INTEGER NOT NULL REFERENCES wait_periods(id) ON DELETE CASCADE,
    author TEXT,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS wait_notes_period ON wait_notes (period_id);
`;

/**
 * Local development without DATABASE_URL: a real Postgres (PGlite, running in-process)
 * saved to ./.local-db. Kept on globalThis so hot reloads don't open the folder twice.
 */
function localSql(): Sql {
  const g = globalThis as { __localDb?: Promise<import("@electric-sql/pglite").PGlite> };
  g.__localDb ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite("./.local-db");
    await db.exec(SCHEMA);
    console.log("Using local database in ./.local-db (set DATABASE_URL to use Neon instead)");
    return db;
  })();
  return async (strings, ...values) => {
    const text = strings.reduce((acc, s, i) => acc + `$${i}` + s);
    const result = await (await g.__localDb!).query<Record<string, unknown>>(text, values);
    return result.rows;
  };
}
