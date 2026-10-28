import { after } from "next/server";
import { verifyDiscordRequest, editOriginal, followUp, panelMessage, postPanel, refreshPanel } from "@/lib/discord";
import { endText, startText, summaryText } from "@/lib/messages";
import { endWait, friendName, getSummary, startWait } from "@/lib/waits";

export const runtime = "nodejs";

// Interaction + response type numbers from Discord's API docs.
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;
const DEFERRED_UPDATE_MESSAGE = 6;
const EPHEMERAL = 64;

type DiscordUser = { username: string; global_name?: string | null };
type Interaction = {
  type: number;
  application_id: string;
  token: string;
  channel_id?: string;
  member?: { nick?: string | null; user: DiscordUser };
  user?: DiscordUser;
  message?: { id: string };
  data?: { name?: string; custom_id?: string; options?: { name: string }[] };
};

function displayName(i: Interaction) {
  const user = i.member?.user ?? i.user;
  return i.member?.nick || user?.global_name || user?.username || "Someone";
}

export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyDiscordRequest(req, body))) {
    return new Response("Invalid request signature", { status: 401 });
  }
  const i = JSON.parse(body) as Interaction;

  if (i.type === PING) return Response.json({ type: PONG });

  const by = displayName(i);
  const friend = friendName();

  // Everything below touches the database, so we acknowledge Discord right away (it allows 3s)
  // and do the real work in after(), which keeps running once the response has been sent.
  if (i.type === APPLICATION_COMMAND && i.data?.name === "wait") {
    const sub = i.data.options?.[0]?.name;

    if (sub === "panel") {
      after(() =>
        run(i, async () => {
          if (!i.channel_id) return { content: "Can't tell which channel this is." };
          const { pinned } = await postPanel(i.channel_id, await getSummary());
          return {
            content: pinned
              ? "Panel posted and pinned. 📌"
              : "Panel posted. (I couldn't pin it. Give the bot the Pin Messages permission, or pin it yourself.)",
          };
        }),
      );
      return Response.json({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } });
    }

    after(() =>
      run(i, async () => {
        if (sub === "start") {
          const r = await startWait(by);
          if (r.started) await refreshPanel();
          return { content: startText(friend, by, r) };
        }
        if (sub === "end") {
          const p = await endWait(by);
          const s = await getSummary();
          if (p) await refreshPanel(s);
          return { content: endText(friend, by, p, s) };
        }
        return { content: summaryText(await getSummary()) };
      }),
    );
    return Response.json({ type: DEFERRED_CHANNEL_MESSAGE });
  }

  if (i.type === MESSAGE_COMPONENT && i.data?.custom_id?.startsWith("wait:")) {
    const action = i.data.custom_id.slice("wait:".length);
    after(async () => {
      try {
        let note: string | null = null;
        if (action === "start") {
          const r = await startWait(by);
          if (r.started) note = startText(friend, by, r);
        } else if (action === "end") {
          const p = await endWait(by);
          if (p) note = endText(friend, by, p, await getSummary());
        }
        const s = await getSummary();
        await editOriginal(i.application_id, i.token, panelMessage(s));
        // If this button was on an older panel, keep the saved panel in sync too.
        await refreshPanel(s, i.message?.id);
        if (note) await followUp(i.application_id, i.token, note);
      } catch (e) {
        console.error(e);
      }
    });
    return Response.json({ type: DEFERRED_UPDATE_MESSAGE });
  }

  return Response.json({ type: CHANNEL_MESSAGE, data: { content: "I don't know that one.", flags: EPHEMERAL } });
}

async function run(i: Interaction, work: () => Promise<Record<string, unknown>>) {
  try {
    await editOriginal(i.application_id, i.token, await work());
  } catch (e) {
    console.error(e);
    await editOriginal(i.application_id, i.token, {
      content: "⚠️ Something went wrong talking to the database. Try again in a moment.",
    }).catch(() => {});
  }
}
