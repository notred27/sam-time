# Wait Tracker

Tracks how long you've spent waiting for your friend. One Vercel deployment provides:

- **A website** with a live timer, Start/End button, running total, average, longest wait, and history.
- **Discord slash commands:** `/wait start`, `/wait end`, `/wait total`, `/wait panel`
- **A pinned Discord panel** with ⏳ Start / ✅ Here / 🔄 Refresh buttons that update in place.
- **Website → Discord announcements** through a channel webhook (optional).

There's no always-on bot process. Discord calls `/api/discord` over HTTP, so everything runs as Vercel serverless functions backed by Postgres (Neon).

---

## Setup

### 1. Deploy to Vercel

Push this folder to a GitHub repo, then in Vercel use **Add New → Project** and import it. (Or run `npx vercel` from this folder.)

### 2. Add a database

In the Vercel project go to **Storage → Create Database → Neon (Postgres)** and connect it to the project. That sets `DATABASE_URL` for you.

Then create the tables once from your computer:

```bash
npx vercel link
npx vercel env pull .env.local
npm install
npm run db:setup
```

### 3. Create the Discord app

1. Go to https://discord.com/developers/applications and choose **New Application**.
2. Under **General Information**, copy the **Application ID** and **Public Key**.
3. Under **Bot**, choose **Reset Token** and copy the token.
4. In Vercel go to **Settings → Environment Variables** and add:
   - `DISCORD_APPLICATION_ID`
   - `DISCORD_PUBLIC_KEY`
   - `DISCORD_BOT_TOKEN`
   - `FRIEND_NAME` (e.g. `Jake`)
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.
6. Back in Discord, under **General Information**, set **Interactions Endpoint URL** to
   `https://YOUR-PROJECT.vercel.app/api/discord` and save. Discord pings the URL to check it; if the save fails, the public key is wrong or you didn't redeploy.
   Use your **production** domain. Vercel's preview URLs are password-protected by default, so Discord can't reach them.

### 4. Invite the bot and register the command

1. In Discord, under **OAuth2 → URL Generator**, tick the scopes `bot` and `applications.commands`, plus the bot permissions **View Channels**, **Send Messages**, **Read Message History** and **Pin Messages**. Open the generated URL and add the bot to your server.
2. Add the same `DISCORD_*` values to your local `.env.local` (`npx vercel env pull .env.local` again works), then run:

```bash
npm run discord:register
```

Global commands can take a little while to show up. To make them appear instantly in one server, also set `DISCORD_GUILD_ID` (right-click the server → Copy Server ID, with Developer Mode on) before running the command.

### 5. Use it

In the channel you want, run `/wait panel`. The bot posts the button panel and pins it. Anyone can then press **Start waiting** / **[Friend] is here**, or use the slash commands or the website. All of them share the same data.

---

## Optional extras

| Variable | What it does |
|---|---|
| `DISCORD_WEBHOOK_URL` | Channel Settings → Integrations → Webhooks → New Webhook → Copy URL. Starts and ends done **on the website** get announced in that channel. |
| `WEB_PASSCODE` | If set, the website asks for this code before anyone can start or end a wait. Discord isn't affected (only people in your server can use it there). |

## Running locally

```bash
npm install
npm run dev
```

You need `DATABASE_URL` in `.env.local`. Discord can't reach `localhost`, so test the bot on the deployed site.

## How it works

- `wait_periods` table: one row per wait (`started_at`, `ended_at`, who started/ended it). A unique partial index allows only **one open wait at a time**, so if two people press Start at the same moment, only one wait is created.
- The total is the sum of finished waits plus the running one. The website ticks it live; Discord uses `<t:…:R>` timestamps, which update on their own.
- `/api/discord` checks Discord's Ed25519 signature, answers right away, then does the database work in `after()`, so Discord's 3-second deadline isn't a problem even when the database is waking up.
