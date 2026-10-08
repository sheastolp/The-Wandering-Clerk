# The Wandering Clerk (Hunt & Hoard)

A Twitch chat RPG: enlist, hunt, fill bounties and trade with the Clerk.
Served at [hunt.tavernworks.dev](https://hunt.tavernworks.dev/onboard).

## How it runs

One Deno process on the Yoga laptop at home (`deno task start`, which runs
`server.ts`):

- **web.ts**: onboarding (`/onboard`, `/oauth/callback`), the moderator-locked
  `/admin` panel and the `/commands` guide, on `127.0.0.1:8803`. A Cloudflare
  Tunnel brings `hunt.tavernworks.dev` to it.
- **twitch.ts**: the chat bot over EventSub WebSocket, always connected.
- **store.ts**: a local SQLite file (`DB_PATH`) both of them use.

Settings live on the laptop in `/etc/tavernworks/clerk.env` (see
`.env.example`). Pushing to `main` deploys: the laptop checks GitHub every few
minutes, pulls, and restarts the bot.

The laptop setup, shared with GuildScribe and UndercoverBurn, is in the
tavernworks repo:
[`bot-host/README.md`](https://github.com/sheastolp/tavernworks/blob/main/bot-host/README.md).

Twitch app redirect URLs needed: `https://hunt.tavernworks.dev/oauth/callback`
and `https://hunt.tavernworks.dev/admin/callback`.

## Moving off Val Town

Before switching the old `huntandhoardbot` val off, copy its data once with
`deno task import-db` (see the top of `tools/import_from_valtown.ts`).
