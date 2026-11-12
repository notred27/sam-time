"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_NOTE_LENGTH, MIN_COUNTED_SECONDS } from "@/lib/constants";
import { formatClock, formatDuration } from "@/lib/format";
import type { Note, Summary } from "@/lib/waits";
import WaitChart from "./WaitChart";

type State = Summary & { passcodeRequired: boolean };

const POLL_MS = 5000;
const RECENT_CARDS = 10;

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

const timeOf = (unix: number) => new Date(unix * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState("");
  const noteList = useRef<HTMLUListElement>(null);
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

  async function send(payload: Record<string, string>, setPending: (pending: boolean) => void) {
    setPending(true);
    try {
      const res = await fetch("/api/wait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, name, passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      apply(data);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }

  const act = (action: "start" | "end") => send({ action }, setBusy);

  async function postNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await send({ action: "note", text: draft }, setPosting)) setDraft("");
  }

  const serverNow = now + offset;
  const active = state?.active ?? null;
  const currentSeconds = active ? serverNow - active.started : 0;
  const totalSeconds = (state?.completedSeconds ?? 0) + currentSeconds;
  const count = state?.completedCount ?? 0;
  const friend = state?.friend ?? "Sam";
  const average = state?.averageSeconds ?? 0;
  const lastDone = state?.recent.find((p) => p.ended !== null);

  const notesByWait = new Map<number, Note[]>();
  for (const n of state?.notes ?? []) notesByWait.set(n.periodId, [...(notesByWait.get(n.periodId) ?? []), n]);
  const activeNotes = active ? (notesByWait.get(active.id) ?? []) : [];

  // Keep the newest thought in view, like a chat.
  useEffect(() => {
    const el = noteList.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeNotes.length]);

  const headline = !state ? [friend, "Time"] : active ? ["Still", "waiting", `for ${friend}`] : [friend, "is", "here"];

  return (
    <main className={active ? "waiting" : ""}>
      <section className="hero">
        <div className="hill hill-back" aria-hidden="true" />
        <div className="hill hill-front" aria-hidden="true" />
        {state && !active ? (
          <Image src="/sam-cowboy.png" alt="" width={727} height={838} priority className="friend-photo cowboy" />
        ) : (
          <Image src="/sam.png" alt="" width={433} height={896} priority className="friend-photo" />
        )}
        <div className="hero-top">
          <span className="eyebrow">{friend} Time</span>
          <a className="icon-button" href="#you" aria-label="Your name and settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </a>
        </div>
        <h1>
          {headline.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
      </section>

      <section className="status">
        <div className="status-row">
          <Image src="/sam.png" alt={friend} width={433} height={896} className="avatar" />
          <div className="status-text">
            <p className="status-title">
              <span className="dot" />
              {state ? (active ? `Waiting for ${friend}` : `${friend} is here`) : "Loading…"}
            </p>
            <p className="sub">
              {active
                ? `Started ${timeOf(active.started)}` + (active.startedBy ? ` by ${active.startedBy}` : "")
                : state
                  ? "Not waiting. Enjoy it while it lasts."
                  : ""}
            </p>
          </div>
          <button className="cta" disabled={!state || busy} onClick={() => act(active ? "end" : "start")}>
            {active ? `${friend}’s here` : "Start waiting"}
          </button>
        </div>
        <div className="clock-row">
          <span className="label">This wait</span>
          <span className="clock">{formatClock(currentSeconds)}</span>
        </div>
        {active && (
          <div className="notes">
            <h2 className="notes-title">Thoughts while we wait</h2>
            {activeNotes.length > 0 ? (
              <ul className="note-list" ref={noteList}>
                {activeNotes.map((n) => (
                  <li key={n.id}>
                    <div className="note-meta">
                      <strong>{n.author ?? "Someone"}</strong> · {timeOf(n.created)}
                    </div>
                    <p>{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sub">No thoughts yet. How’s everyone holding up?</p>
            )}
            <form className="note-form" onSubmit={postNote}>
              <input
                aria-label="Your thought"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_NOTE_LENGTH}
                placeholder={`Say something about ${friend}…`}
              />
              <button className="cta" disabled={posting || !draft.trim()}>
                Post
              </button>
            </form>
            <p className="note-as">
              Posting as {name.trim() || "Someone"} · <a href="#you">change</a>
            </p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="story">
        {count || active ? (
          <p className="lede">
            <strong>{formatDuration(totalSeconds)}</strong> spent waiting for {friend}, across{" "}
            <strong>
              {count + (active ? 1 : 0)} wait{count + (active ? 1 : 0) === 1 ? "" : "s"}
            </strong>
            .
          </p>
        ) : (
          <p className="lede">{state ? "No waits yet. Press Start the next time you’re stuck waiting." : " "}</p>
        )}
        <div className="stats">
          <div>
            <div className="label">Average</div>
            <div className="value">{average ? formatDuration(average) : "–"}</div>
          </div>
          <div>
            <div className="label">Longest</div>
            <div className="value">{count || active ? formatDuration(Math.max(state?.longestSeconds ?? 0, currentSeconds)) : "–"}</div>
          </div>
          {active && average ? (
            <div>
              <div className="label">This wait vs avg</div>
              <div className="value">{(currentSeconds / average).toFixed(1)}×</div>
            </div>
          ) : (
            <div>
              <div className="label">Last wait</div>
              <div className="value">{lastDone ? formatDuration(lastDone.ended! - lastDone.started) : "–"}</div>
            </div>
          )}
        </div>
      </section>

      {state && (
        <section className="recent" aria-labelledby="recent-title">
          <h2 id="recent-title">Recent waits</h2>
          {state.recent.length === 0 ? (
            <p className="empty">Nothing yet. Press Start the next time you’re stuck waiting.</p>
          ) : (
            <ul className="cards">
              {state.recent.slice(0, RECENT_CARDS).map((p) => {
                const ended = p.ended ?? serverNow;
                const notes = notesByWait.get(p.id) ?? [];
                return (
                  <li key={p.id} className={`card ${p.ended === null ? "live" : ""}`}>
                    <div className="card-art">
                      <Image src="/sam.png" alt="" width={433} height={896} />
                    </div>
                    <div className="card-body">
                      <div className="when">
                        {new Date(p.started * 1000).toLocaleString([], {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="dur">
                        {formatDuration(ended - p.started)}
                        {p.ended === null && <small> so far</small>}
                      </div>
                      <div className="who">
                        {[p.startedBy && `started by ${p.startedBy}`, p.endedBy && `ended by ${p.endedBy}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {notes.length > 0 && (
                        <details className="card-notes">
                          <summary>
                            💬 {notes.length} thought{notes.length === 1 ? "" : "s"}
                          </summary>
                          <ul>
                            {notes.map((n) => (
                              <li key={n.id}>
                                <strong>{n.author ?? "Someone"}:</strong> {n.body}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {state && (
        <WaitChart
          history={state.history}
          live={active && currentSeconds >= MIN_COUNTED_SECONDS ? { started: active.started, seconds: currentSeconds } : null}
          now={serverNow}
        />
      )}

      <section className="settings" id="you">
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
      </section>
    </main>
  );
}
