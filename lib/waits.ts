import { sql } from "./db";

// All times are unix seconds (float), computed in SQL so we never depend on driver date parsing.
export type Period = {
  id: number;
  started: number;
  ended: number | null;
  startedBy: string | null;
  endedBy: string | null;
};

export type Summary = {
  friend: string;
  now: number;
  active: Period | null;
  /** Completed waits only; add (now - active.started) for a live total. */
  completedSeconds: number;
  completedCount: number;
  longestSeconds: number;
  recent: Period[];
};

type Row = {
  id: number;
  started: number;
  ended: number | null;
  started_by: string | null;
  ended_by: string | null;
};

function toPeriod(r: Row): Period {
  return {
    id: r.id,
    started: r.started,
    ended: r.ended,
    startedBy: r.started_by,
    endedBy: r.ended_by,
  };
}

export function friendName() {
  return process.env.FRIEND_NAME?.trim() || "our friend";
}

export async function getSummary(): Promise<Summary> {
  const db = sql();
  const [stats, recent, now] = await Promise.all([
    db`
      SELECT
        COALESCE(SUM(EXTRACT(EPOCH FROM ended_at - started_at)), 0)::float8 AS total,
        COUNT(*)::int AS count,
        COALESCE(MAX(EXTRACT(EPOCH FROM ended_at - started_at)), 0)::float8 AS longest
      FROM wait_periods
      WHERE ended_at IS NOT NULL
    `,
    db`
      SELECT id,
        EXTRACT(EPOCH FROM started_at)::float8 AS started,
        EXTRACT(EPOCH FROM ended_at)::float8 AS ended,
        started_by, ended_by
      FROM wait_periods
      ORDER BY started_at DESC
      LIMIT 25
    `,
    db`SELECT EXTRACT(EPOCH FROM now())::float8 AS now`,
  ]);

  const s = (stats as { total: number; count: number; longest: number }[])[0];
  const periods = (recent as Row[]).map(toPeriod);
  return {
    friend: friendName(),
    now: (now as { now: number }[])[0].now,
    // At most one open period exists (enforced by a unique index), and it is always the newest.
    active: periods.find((p) => p.ended === null) ?? null,
    completedSeconds: s.total,
    completedCount: s.count,
    longestSeconds: s.longest,
    recent: periods,
  };
}

/** Starts a wait. If one is already running, returns it with started=false. */
export async function startWait(by: string): Promise<{ started: boolean; period: Period }> {
  const db = sql();
  // ON CONFLICT hits the one_active_wait partial index, so two simultaneous starts can't both win.
  const inserted = (await db`
    INSERT INTO wait_periods (started_by) VALUES (${by})
    ON CONFLICT DO NOTHING
    RETURNING id,
      EXTRACT(EPOCH FROM started_at)::float8 AS started,
      NULL::float8 AS ended,
      started_by, ended_by
  `) as Row[];
  if (inserted.length) return { started: true, period: toPeriod(inserted[0]) };

  const active = (await db`
    SELECT id,
      EXTRACT(EPOCH FROM started_at)::float8 AS started,
      NULL::float8 AS ended,
      started_by, ended_by
    FROM wait_periods WHERE ended_at IS NULL
  `) as Row[];
  return { started: false, period: toPeriod(active[0]) };
}

/** Ends the running wait. Returns null if nothing was running. */
export async function endWait(by: string): Promise<Period | null> {
  const rows = (await sql()`
    UPDATE wait_periods SET ended_at = now(), ended_by = ${by}
    WHERE ended_at IS NULL
    RETURNING id,
      EXTRACT(EPOCH FROM started_at)::float8 AS started,
      EXTRACT(EPOCH FROM ended_at)::float8 AS ended,
      started_by, ended_by
  `) as Row[];
  return rows.length ? toPeriod(rows[0]) : null;
}

export type PanelLocation = { channelId: string; messageId: string };

export async function getPanel(): Promise<PanelLocation | null> {
  const rows = (await sql()`SELECT value FROM settings WHERE key = 'panel'`) as { value: PanelLocation }[];
  return rows[0]?.value ?? null;
}

export async function setPanel(panel: PanelLocation | null) {
  if (panel) {
    await sql()`
      INSERT INTO settings (key, value) VALUES ('panel', ${JSON.stringify(panel)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  } else {
    await sql()`DELETE FROM settings WHERE key = 'panel'`;
  }
}
