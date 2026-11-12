// Registers the /wait slash command with Discord.  Usage: npm run discord:register
const appId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
if (!appId || !token) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in .env.local");
  process.exit(1);
}

const commands = [
  {
    name: "wait",
    description: "Track how long we're waiting",
    options: [
      { type: 1, name: "start", description: "Start a waiting period" },
      { type: 1, name: "end", description: "End the current waiting period (they showed up)" },
      { type: 1, name: "total", description: "Show the total time spent waiting" },
      {
        type: 1,
        name: "note",
        description: "Share a thought about the current wait",
        options: [{ type: 3, name: "text", description: "What are you thinking?", required: true, max_length: 500 }],
      },
      { type: 1, name: "panel", description: "Post a pinned panel with Start / Done buttons in this channel" },
    ],
  },
];

// Server-specific commands show up instantly; global ones work in every server the bot is in.
const url = guildId
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`;

const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
if (!res.ok) {
  console.error(`Failed: ${res.status}`, await res.text());
  process.exit(1);
}
console.log(`Registered /wait ${guildId ? `in server ${guildId}` : "globally"}.`);
