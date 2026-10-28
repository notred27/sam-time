"use client";

import { useCallback, useEffect, useState } from "react";
import { formatClock, formatDuration } from "@/lib/format";
import type { Summary } from "@/lib/waits";

type State = Summary & { passcodeRequired: boolean };

const POLL_MS = 5000;

function usePersisted(key: string) {
  const [value, setValue] = useState("");
  useEffect(() => {
    try {
      setValue(localStorage.getItem(key) ?? "");
    } catch {}
  }, [key]);
  const update = (v: string) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  };
  return [value, update] as const;
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Server clock minus ours, so the live timer agrees for everyone regardless of device clock.
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [name, setName] = usePersisted("wait-tracker:name");
  const [passcode, setPasscode] = usePersisted("wait-tracker:passcode");

  const apply = useCallback((data: State) => {
    setState(data);
    setOffset(data.now - Date.now() / 1000);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wait", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      apply(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apply]);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(tick);
  }, []);

  async function act(action: "start" | "end") {
    setBusy(true);
    try {
      const res = await fetch("/api/wait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name, passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      apply(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const serverNow = now + offset;
  const active = state?.active ?? null;
  const currentSeconds = active ? serverNow - active.started : 0;
  const totalSeconds = (state?.completedSeconds ?? 0) + currentSeconds;
  const count = state?.completedCount ?? 0;
  const friend = state?.friend ?? "our friend";

  return (
    <main>
      <p className="eyebrow">Wait tracker</p>
      <h1>Waiting for {friend}</h1>

      <section className={`card status ${active ? "waiting" : ""}`}>
        <span className="pill">
          <span className="dot" />
          {state ? (active ? "Waiting right now" : `${friend} is here`) : "Loading…"}
        </span>
        <div className="clock">{formatClock(currentSeconds)}</div>
        <p className="sub">
          {active
            ? `Started ${new Date(active.started * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` +
              (active.startedBy ? ` by ${active.startedBy}` : "")
            : state
              ? "Not waiting. Enjoy it while it lasts."
              : ""}
        </p>
        <button disabled={!state || busy} onClick={() => act(active ? "end" : "start")}>
          {active ? `${friend} is here` : "Start waiting"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      <div className="stats">
        <div className="card stat">
          <div className="label">Total waited</div>
          <div className="value">{formatDuration(totalSeconds)}</div>
        </div>
        <div className="card stat">
          <div className="label">Waits</div>
          <div className="value">{count + (active ? 1 : 0)}</div>
        </div>
        <div className="card stat">
          <div className="label">Average</div>
          <div className="value">{count ? formatDuration(state!.completedSeconds / count) : "–"}</div>
        </div>
        <div className="card stat">
          <div className="label">Longest</div>
          <div className="value">
            {count || active ? formatDuration(Math.max(state?.longestSeconds ?? 0, currentSeconds)) : "–"}
          </div>
        </div>
      </div>

      <h2>Recent waits</h2>
      <section className="card history">
        {state && state.recent.length === 0 ? (
          <p className="empty">Nothing yet. Press Start the next time you're stuck waiting.</p>
        ) : (
          <ul>
            {state?.recent.map((p) => {
              const ended = p.ended ?? serverNow;
              return (
                <li key={p.id}>
                  <div>
                    <div className="when">
                      {new Date(p.started * 1000).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="who">
                      {[p.startedBy && `started by ${p.startedBy}`, p.endedBy && `ended by ${p.endedBy}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className={`dur ${p.ended === null ? "live" : ""}`}>
                    {formatDuration(ended - p.started)}
                    {p.ended === null && " so far"}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="settings">
        <label>
          Your name (shown in history and Discord)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" maxLength={40} />
        </label>
        {state?.passcodeRequired && (
          <label>
            Group passcode
            <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
          </label>
        )}
      </div>
    </main>
  );
}
