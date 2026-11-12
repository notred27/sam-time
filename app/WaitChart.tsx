"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MIN_COUNTED_SECONDS } from "@/lib/constants";
import { formatDuration } from "@/lib/format";

type Point = { started: number; seconds: number; live?: boolean };
type Range = "week" | "month" | "all";

const RANGES: { id: Range; label: string; days: number | null }[] = [
  { id: "week", label: "Week", days: 7 },
  { id: "month", label: "Month", days: 30 },
  { id: "all", label: "All time", days: null },
];

const DAY = 86400;
const HEIGHT = 220;
// The right margin holds the "avg" label so it never sits on the line.
const M = { top: 16, right: 36, bottom: 28, left: 44 };
// Candidate gridline steps in seconds, smallest first: 1m … 1d.
const STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/** Compact axis label: "45m", "2h", "1h 30m" */
function tickLabel(s: number) {
  if (s === 0) return "0";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function dateLabel(t: number, span: number) {
  const d = new Date(t * 1000);
  if (span <= 8 * DAY) return d.toLocaleDateString([], { weekday: "short" });
  if (span <= 200 * DAY) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
}

const whenLabel = (t: number) =>
  new Date(t * 1000).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function WaitChart({
  history,
  live,
  now,
}: {
  history: Point[];
  /** The running wait, plotted as a hollow point that grows each second. */
  live: Point | null;
  now: number;
}) {
  const [range, setRange] = useState<Range>("month");
  const [width, setWidth] = useState(600);
  const [focus, setFocus] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const days = RANGES.find((r) => r.id === range)!.days;
  const completed = history.filter((p) => days === null || p.started >= now - days * DAY);
  const points = live ? [...completed, { ...live, live: true }] : completed;

  const from = days !== null ? now - days * DAY : Math.min(points[0]?.started ?? now, now - DAY);
  const span = Math.max(now - from, 1);
  const avg = completed.length ? completed.reduce((sum, p) => sum + p.seconds, 0) / completed.length : 0;

  const maxS = Math.max(60, avg, ...points.map((p) => p.seconds));
  const step = STEPS.find((s) => maxS / s <= 4) ?? Math.ceil(maxS / 4 / DAY) * DAY;
  const top = Math.ceil(maxS / step) * step;
  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  const innerW = Math.max(width - M.left - M.right, 10);
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - from) / span) * innerW;
  const y = (s: number) => M.top + innerH - (s / top) * innerH;
  const xTicks = [0, 1, 2, 3].map((i) => from + (i * span) / 3);

  const line = completed.map((p, i) => `${i ? "L" : "M"}${x(p.started).toFixed(1)} ${y(p.seconds).toFixed(1)}`).join(" ");
  const last = completed[completed.length - 1];
  const active = focus !== null ? points[Math.min(focus, points.length - 1)] : null;

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!points.length) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.started) - px) < Math.abs(x(points[best].started) - px)) best = i;
    });
    setFocus(best);
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (!points.length) return;
    const cur = focus ?? points.length - 1;
    if (e.key === "ArrowLeft") setFocus(Math.max(0, cur - 1));
    else if (e.key === "ArrowRight") setFocus(Math.min(points.length - 1, cur + 1));
    else if (e.key === "Home") setFocus(0);
    else if (e.key === "End") setFocus(points.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <section className="chart-card" aria-labelledby="chart-title">
      <div className="chart-head">
        <div>
          <h2 id="chart-title">Response time</h2>
          <p className="chart-sub">
            {completed.length
              ? `Average ${formatDuration(avg)} over ${completed.length} wait${completed.length === 1 ? "" : "s"} of ${tickLabel(MIN_COUNTED_SECONDS)} or more`
              : `How long each wait of ${tickLabel(MIN_COUNTED_SECONDS)} or more lasted`}
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-box" ref={box}>
        {points.length === 0 ? (
          <p className="chart-empty">No waits of {tickLabel(MIN_COUNTED_SECONDS)} or more in this range yet.</p>
        ) : (
          <>
            <svg
              width={width}
              height={HEIGHT}
              tabIndex={0}
              aria-label="Wait lengths over time. Use the arrow keys to step through waits."
              onPointerMove={onPointerMove}
              onPointerLeave={() => setFocus(null)}
              onFocus={() => setFocus(points.length - 1)}
              onBlur={() => setFocus(null)}
              onKeyDown={onKeyDown}
            >
              {yTicks.map((t) => (
                <g key={t}>
                  <line className="grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
                  <text className="axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                    {tickLabel(t)}
                  </text>
                </g>
              ))}
              {xTicks.map((t, i) => (
                <text
                  key={i}
                  className="axis"
                  x={x(t)}
                  y={HEIGHT - 8}
                  textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}
                >
                  {dateLabel(t, span)}
                </text>
              ))}

              {avg > 0 && (
                <g>
                  <line className="avg" x1={M.left} x2={width - M.right} y1={y(avg)} y2={y(avg)} />
                  <text className="axis" x={width - M.right + 6} y={y(avg)} dy="0.32em">
                    avg
                  </text>
                </g>
              )}

              {active && <line className="crosshair" x1={x(active.started)} x2={x(active.started)} y1={M.top} y2={M.top + innerH} />}

              <path className="series" d={line} />
              {live && last && (
                <line className="series live-link" x1={x(last.started)} y1={y(last.seconds)} x2={x(live.started)} y2={y(live.seconds)} />
              )}
              {points.map((p, i) => (
                <circle
                  key={`${p.started}-${i}`}
                  className={`marker ${p.live ? "live" : ""} ${active === p ? "on" : ""}`}
                  cx={x(p.started)}
                  cy={y(p.seconds)}
                  r={p.live || active === p ? 6 : 4}
                />
              ))}
            </svg>

            {active && (
              <div
                className="chart-tip"
                style={{
                  left: Math.min(Math.max(x(active.started), 72), width - 72),
                  top: y(active.seconds) - 12,
                }}
              >
                <strong>
                  {formatDuration(active.seconds)}
                  {active.live && " so far"}
                </strong>
                <span>{whenLabel(active.started)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {points.length > 0 && (
        <details className="chart-table">
          <summary>Show as table</summary>
          <div className="chart-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Waited</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p, i) => (
                  <tr key={`${p.started}-${i}`}>
                    <td>{whenLabel(p.started)}</td>
                    <td>
                      {formatDuration(p.seconds)}
                      {p.live && " so far"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
