// =============================================================================
//  bot.ts — run by the GitHub Actions workflow (see
//  .github/workflows/bot.yml). Each run holds the connection open for
//  RUN_BUDGET_MS, then exits cleanly well before GitHub's 6-hour hard cap
//  on job execution time. The next scheduled run reconnects and continues.
// =============================================================================
import { runForWindow } from "./twitch.ts";

// GitHub's hard cap is 6 hours (360 min) per job; stay comfortably under it
// so there's always time to close the socket and flush queued replies.
const RUN_BUDGET_MS = 5 * 60 * 60 * 1000 + 45 * 60 * 1000; // 5h45m

// --- TEMPORARY DIAGNOSTIC: prints only the character COUNT of each secret,
// never the value itself, so we can spot a truncated/corrupted secret
// without exposing anything sensitive in the log. Remove once resolved. ---
function len(name: string): number {
  return (Deno.env.get(name) || "").length;
}
console.log("--- secret length check ---");
console.log("TWITCH_CLIENT_ID length:", len("TWITCH_CLIENT_ID"));
console.log("TWITCH_CLIENT_SECRET length:", len("TWITCH_CLIENT_SECRET"));
console.log("TWITCH_BOT_ACCESS_TOKEN length:", len("TWITCH_BOT_ACCESS_TOKEN"));
console.log("TWITCH_BOT_REFRESH_TOKEN length:", len("TWITCH_BOT_REFRESH_TOKEN"));
console.log("TWITCH_BOT_USERNAME:", Deno.env.get("TWITCH_BOT_USERNAME"));
console.log("TWITCH_CHANNEL:", Deno.env.get("TWITCH_CHANNEL"));
console.log("--- end secret length check ---");

console.log("Hunt & Hoard run starting...");
await runForWindow(RUN_BUDGET_MS);
console.log("Hunt & Hoard run finished.");
