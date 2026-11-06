// The Wandering Clerk and the Grand Orrery: the Clerk's world comes from it.
//
// The Grand Orrery (github.com/sheastolp/grand-orrery) is the universe the
// Clerk lives in. The Clerk is a guildscribe who broke from GuildScribe and
// walks the road out to the Woodland Road, and the peddlers who follow that
// road are the ones who hawk on the Clerk's stall. Their names come from the
// Orrery's roster.md ("The road peddlers" table), read live from GitHub's
// `main` branch at the start of each run and every 30 minutes after.
//
// The Orrery is the source: rename or add a road peddler there and the
// Clerk follows on the next check. data.ts's merchantNames is only the
// fallback until the first good read, and if GitHub can't be reached the
// last good list is kept. Nothing ever waits on it for more than 8 s.
//
// Settings (env):
//   ORRERY=off           don't read the Orrery (the built-in names are used)
//   ORRERY_BRANCH=main   the branch to read
//   ORRERY_RAW_BASE=…    default https://raw.githubusercontent.com/sheastolp/grand-orrery/

import { merchantNames } from "./data.ts";

const ENABLED = (Deno.env.get("ORRERY") ?? "on").toLowerCase() !== "off";
const BRANCH = Deno.env.get("ORRERY_BRANCH") || "main";
const RAW_BASE = (Deno.env.get("ORRERY_RAW_BASE") || "https://raw.githubusercontent.com/sheastolp/grand-orrery/").replace(/\/?$/, "/");
export const ORRERY_REFRESH_MS = 30 * 60 * 1000;

const cell = (c: string) => c.replace(/\*\*/g, "").replace(/\*/g, "").trim();

/** The names in roster.md's "**The road peddlers**" table, in order. */
export function parseRoadPeddlers(md: string): string[] {
  const names: string[] = [];
  let inList = false;
  let header = false;
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) { inList = false; continue; }
    if (/^\*\*The road peddlers\*\*/i.test(line)) { inList = true; header = false; continue; }
    if (!inList) continue;
    if (!line.startsWith("|")) {
      if (line && header) inList = false; // the table ended
      continue;
    }
    const cells = line.replace(/^\||\|$/g, "").split("|").map(cell);
    if (!header) { header = true; continue; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (cells[0]) names.push(cells[0]);
  }
  return names;
}

let lastRead = 0;

/** Re-read the road peddlers from the Orrery and swap them into
 * merchantNames in place. Never throws. */
export async function refreshFromOrrery(): Promise<void> {
  if (!ENABLED) return;
  lastRead = Date.now();
  try {
    const res = await fetch(`${RAW_BASE}${BRANCH}/roster.md`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
    const names = parseRoadPeddlers(await res.text());
    if (!names.length) throw new Error("no road peddlers in roster.md");
    merchantNames.splice(0, merchantNames.length, ...names);
    console.log(`Orrery: ${names.length} road peddlers from roster.md`);
  } catch (e) {
    console.error("Orrery: roster.md read failed, keeping the last names", String(e));
  }
}

/** Call from the run loop: re-reads once ORRERY_REFRESH_MS has passed. */
export function refreshFromOrreryIfStale(): void {
  if (Date.now() - lastRead >= ORRERY_REFRESH_MS) refreshFromOrrery();
}
