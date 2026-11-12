import { after } from "next/server";
import { announce, refreshPanel } from "@/lib/discord";
import { MAX_NOTE_LENGTH } from "@/lib/constants";
import { endText, noteText, startText } from "@/lib/messages";
import { addNote, endWait, friendName, getSummary, startWait } from "@/lib/waits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const passcodeRequired = () => !!process.env.WEB_PASSCODE;

export async function GET() {
  try {
    return Response.json({ ...(await getSummary()), passcodeRequired: passcodeRequired() });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't reach the database." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { action, name, passcode, text } = (await req.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    passcode?: string;
    text?: string;
  };
  if (passcodeRequired() && passcode !== process.env.WEB_PASSCODE) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  if (action !== "start" && action !== "end" && action !== "note") {
    return Response.json({ error: "action must be start, end or note" }, { status: 400 });
  }
  const body = typeof text === "string" ? text.trim() : "";
  if (action === "note" && (!body || body.length > MAX_NOTE_LENGTH)) {
    return Response.json({ error: `Notes need 1–${MAX_NOTE_LENGTH} characters.` }, { status: 400 });
  }

  const author = (name?.trim() || "Someone").slice(0, 40);
  const by = author + " (web)";
  const friend = friendName();

  try {
    let note: string | null = null;
    if (action === "start") {
      const r = await startWait(by);
      if (r.started) note = startText(friend, by, r);
    } else if (action === "end") {
      const p = await endWait(by);
      if (p) note = endText(friend, by, p, await getSummary());
    } else {
      const n = await addNote(author, body);
      if (!n) return Response.json({ error: noteText(friend, author, null) }, { status: 409 });
      note = noteText(friend, by, n);
    }
    const s = await getSummary();
    if (note) {
      const text = note;
      // Tell Discord after responding, so the website stays snappy.
      after(async () => {
        await Promise.all([announce(text), refreshPanel(s)]).catch((e) => console.error(e));
      });
    }
    return Response.json({ ...s, passcodeRequired: passcodeRequired() });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't reach the database." }, { status: 500 });
  }
}
