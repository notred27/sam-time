import { after } from "next/server";
import { announce, refreshPanel } from "@/lib/discord";
import { endText, startText } from "@/lib/messages";
import { endWait, friendName, getSummary, startWait } from "@/lib/waits";

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
  const { action, name, passcode } = (await req.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    passcode?: string;
  };
  if (passcodeRequired() && passcode !== process.env.WEB_PASSCODE) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  if (action !== "start" && action !== "end") {
    return Response.json({ error: "action must be start or end" }, { status: 400 });
  }

  const by = (name?.trim() || "Someone").slice(0, 40) + " (web)";
  const friend = friendName();

  try {
    let note: string | null = null;
    if (action === "start") {
      const r = await startWait(by);
      if (r.started) note = startText(friend, by, r);
    } else {
      const p = await endWait(by);
      if (p) note = endText(friend, by, p, await getSummary());
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
