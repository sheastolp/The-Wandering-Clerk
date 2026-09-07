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

console.log("Hunt & Hoard run starting...");
await runForWindow(RUN_BUDGET_MS);
console.log("Hunt & Hoard run finished.");
