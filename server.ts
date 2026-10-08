// =============================================================================
//  server.ts — the Wandering Clerk's one always-on process on the Yoga laptop:
//    - the web side (web.ts) on 127.0.0.1:PORT, where the Cloudflare Tunnel
//      delivers hunt.tavernworks.dev
//    - the chat bot (twitch.ts), reconnecting once a day
//  Both use the same local SQLite store (store.ts).
//
//    deno task start    (the systemd unit runs the same thing)
// =============================================================================
import handler from "./web.ts";
import { runForWindow } from "./twitch.ts";

const PORT = Number(Deno.env.get("PORT") || 8803);
const HOST = Deno.env.get("HOST") || "127.0.0.1";
const PUBLIC_ORIGIN = new URL(Deno.env.get("PUBLIC_BASE_URL") || "https://hunt.tavernworks.dev").origin;

Deno.serve({ port: PORT, hostname: HOST }, (req) => {
  // The tunnel hands requests over as plain http://127.0.0.1; give the handler
  // the public https URL the visitor actually used (OAuth redirect URIs are
  // built from it).
  const url = new URL(req.url);
  return handler(new Request(new URL(url.pathname + url.search, PUBLIC_ORIGIN), req));
});

const WINDOW_MS = 24 * 60 * 60 * 1000;
while (true) {
  try {
    console.log("Hunt & Hoard bot connecting...");
    await runForWindow(WINDOW_MS);
  } catch (e) {
    console.error("Hunt & Hoard bot stopped with an error:", e);
  }
  await new Promise((r) => setTimeout(r, 10_000)); // short pause before reconnecting
}
