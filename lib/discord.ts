import { getPanel, setPanel, getSummary, type Summary } from "./waits";
import { summaryText } from "./messages";

const API = "https://discord.com/api/v10";

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

let publicKey: Promise<CryptoKey> | null = null;

/** Discord signs every interaction with Ed25519; requests that fail this must get a 401. */
export async function verifyDiscordRequest(req: Request, body: string) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const keyHex = process.env.DISCORD_PUBLIC_KEY;
  if (!signature || !timestamp || !keyHex) return false;
  try {
    publicKey ??= crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify(
      "Ed25519",
      await publicKey,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

const NO_PINGS = { parse: [] as string[] };

export function panelComponents(s: Summary) {
  const siteHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const buttons: Record<string, unknown>[] = [
    { type: 2, style: 3, custom_id: "wait:start", label: "Start waiting", emoji: { name: "⏳" }, disabled: !!s.active },
    { type: 2, style: 4, custom_id: "wait:end", label: `${s.friend} is here`.slice(0, 80), emoji: { name: "✅" }, disabled: !s.active },
    { type: 2, style: 2, custom_id: "wait:refresh", label: "Refresh", emoji: { name: "🔄" } },
  ];
  if (siteHost) buttons.push({ type: 2, style: 5, label: "Open tracker", url: `https://${siteHost}` });
  return [{ type: 1, components: buttons }];
}

export function panelMessage(s: Summary) {
  return { content: summaryText(s), components: panelComponents(s), allowed_mentions: NO_PINGS };
}

async function discord(path: string, init: { method: string; body?: unknown; bot?: boolean }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.bot) {
    if (!process.env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN is not set");
    headers.Authorization = `Bot ${process.env.DISCORD_BOT_TOKEN}`;
  }
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Discord ${init.method} ${path} failed: ${res.status} ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Edit the reply to an interaction (or, for a button click, the message the button is on). */
export function editOriginal(appId: string, token: string, message: Record<string, unknown>) {
  return discord(`/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH",
    body: { allowed_mentions: NO_PINGS, ...message },
  });
}

export function followUp(appId: string, token: string, content: string) {
  return discord(`/webhooks/${appId}/${token}`, {
    method: "POST",
    body: { content, allowed_mentions: NO_PINGS },
  });
}

/** Posts a fresh button panel in a channel, pins it if allowed, and remembers it. */
export async function postPanel(channelId: string, s: Summary) {
  const msg = (await discord(`/channels/${channelId}/messages`, {
    method: "POST",
    bot: true,
    body: panelMessage(s),
  })) as { id: string };
  await setPanel({ channelId, messageId: msg.id });
  const pinned = await discord(`/channels/${channelId}/pins/${msg.id}`, { method: "PUT", bot: true })
    .then(() => true)
    .catch(() => false);
  return { messageId: msg.id, pinned };
}

/** Re-renders the saved panel so it matches the database. Quietly does nothing if there's no panel. */
export async function refreshPanel(s?: Summary, skipMessageId?: string) {
  if (!process.env.DISCORD_BOT_TOKEN) return;
  const panel = await getPanel();
  if (!panel || panel.messageId === skipMessageId) return;
  try {
    await discord(`/channels/${panel.channelId}/messages/${panel.messageId}`, {
      method: "PATCH",
      bot: true,
      body: panelMessage(s ?? (await getSummary())),
    });
  } catch (e) {
    // The panel was deleted (or the bot lost access): forget it.
    if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 403) await setPanel(null);
    else throw e;
  }
}

/** Channel webhook announcement, used for actions taken on the website. */
export async function announce(content: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: NO_PINGS, username: "Wait Tracker" }),
  });
  if (!res.ok) throw new Error(`Webhook failed: ${res.status} ${await res.text()}`);
}
