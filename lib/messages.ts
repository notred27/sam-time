import { formatDuration } from "./format";
import type { Note, Period, Summary } from "./waits";

// Discord renders <t:unix:R> as a live "23 minutes ago" on each viewer's client.
const ts = (unix: number, style: "t" | "R" | "f") => `<t:${Math.floor(unix)}:${style}>`;

export function escapeMd(text: string) {
  return text.replace(/([\*_~`|>#[\]()-])/g, "\$1");
}

export function startText(friend: string, by: string, r: { started: boolean; period: Period }) {
  if (r.started) {
    return `⏳ **${escapeMd(by)}** started waiting for ${escapeMd(friend)} at ${ts(r.period.started, "t")}.`;
  }
  const who = r.period.startedBy ? ` (started by ${escapeMd(r.period.startedBy)})` : "";
  return `Already waiting for ${escapeMd(friend)} since ${ts(r.period.started, "t")}, ${ts(r.period.started, "R")}${who}.`;
}

export function endText(friend: string, by: string, period: Period | null, s: Summary) {
  if (!period) return `There's no wait running right now. Use **Start** when you're stuck waiting for ${escapeMd(friend)} again.`;
  const lasted = formatDuration((period.ended ?? s.now) - period.started);
  return (
    `✅ **${escapeMd(friend)}** is here (ended by ${escapeMd(by)}). That wait lasted **${lasted}**.\n` +
    `Lifetime total: **${formatDuration(s.completedSeconds)}** across **${s.completedCount}** waits.`
  );
}

export function noteText(friend: string, by: string, note: Note | null) {
  if (!note) return `Notes can only be added while you're waiting for ${escapeMd(friend)}. Start a wait first.`;
  return `💬 **${escapeMd(by)}** while waiting for ${escapeMd(friend)}: ${note.body}`;
}

// The panel shows the newest few notes, trimmed, so it stays under Discord's 2000-character limit.
const PANEL_NOTES = 5;
const PANEL_NOTE_CHARS = 150;

export function summaryText(s: Summary) {
  const friend = escapeMd(s.friend);
  const lines = [`## ⏳ Waiting for ${friend}`];

  if (s.active) {
    const who = s.active.startedBy ? ` · started by ${escapeMd(s.active.startedBy)}` : "";
    lines.push(`🔴 **Waiting right now** since ${ts(s.active.started, "t")} (${ts(s.active.started, "R")})${who}`);
    const activeId = s.active.id;
    const notes = s.notes.filter((n) => n.periodId === activeId).slice(-PANEL_NOTES);
    for (const n of notes) {
      const body = n.body.length > PANEL_NOTE_CHARS ? `${n.body.slice(0, PANEL_NOTE_CHARS)}…` : n.body;
      lines.push(`> 💬 **${escapeMd(n.author ?? "Someone")}**: ${body}`);
    }
  } else {
    lines.push(`🟢 **Not waiting.** ${friend} is here (for once).`);
  }

  lines.push("");
  if (s.completedCount > 0) {
    const avg = s.averageSeconds ? formatDuration(s.averageSeconds) : "–";
    lines.push(
      `Total time waited: **${formatDuration(s.completedSeconds)}** across **${s.completedCount}** waits` +
        (s.active ? " (plus the one running now)" : ""),
      `Average: **${avg}** · Longest: **${formatDuration(s.longestSeconds)}**`,
    );
  } else {
    lines.push("No finished waits yet.");
  }
  return lines.join("\n");
}
