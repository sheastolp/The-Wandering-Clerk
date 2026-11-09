// The Wandering Clerk and the Grand Orrery: the Clerk's world comes from it.
//
// The Grand Orrery (github.com/sheastolp/grand-orrery) is the universe every
// Tavernworks bot runs off. The peddlers who hawk on the Clerk's stall are
// the Orrery's road peddlers: its people whose group is "The road peddlers",
// read from the Orrery's database with the Orrery's own client at the start
// of each run and every 30 minutes after.
//
// The Clerk keeps no names of its own. The Orrery's last good list is saved
// in the Clerk's store (meta "orrery-road-peddlers") and used when GitHub
// can't be reached, so a new run still has the Orrery's names. Nothing ever
// waits on it for more than 8 s.
//
// Settings (env):
//   ORRERY=off           don't read the Orrery
//   ORRERY_BRANCH=main   the branch's database to read

import { Orrery } from "https://cdn.jsdelivr.net/gh/sheastolp/grand-orrery@d91122f2f80a0f98644f9c473142be268c9a9530/client/orrery.js";
import { merchantNames } from "./data.ts";
import { getMeta, setMeta } from "./storeClient.ts";

const ENABLED = (Deno.env.get("ORRERY") ?? "on").toLowerCase() !== "off";
const BRANCH = Deno.env.get("ORRERY_BRANCH") || "main";
const CACHE_KEY = "orrery-road-peddlers";
export const ORRERY_REFRESH_MS = 30 * 60 * 1000;

type Person = { type: string; name: string; group?: string; status?: string };

/** The Orrery's road peddlers, in roster order. */
export function roadPeddlers(entities: Person[]): string[] {
  return entities.filter((e) => e.type === "person" && e.group === "The road peddlers" && (e.status === "decided" || e.status === "dm-lore") && e.name).map((e) => e.name);
}

let lastRead = 0;
let db: Orrery | null = null;
const use = (names: string[]) => merchantNames.splice(0, merchantNames.length, ...names);

/** Re-read the road peddlers from the Orrery and swap them into
 * merchantNames in place. Never throws. */
export async function refreshFromOrrery(): Promise<void> {
  if (!ENABLED) return;
  lastRead = Date.now();
  try {
    if (!db) {
      db = new Orrery({ branch: BRANCH, refreshMinutes: 0, fetch: (u: string, i: RequestInit = {}) => fetch(u, { ...i, signal: AbortSignal.timeout(8_000) }) });
      await db.ready();
    } else await db.refresh();
    const names = db.loaded ? roadPeddlers(db.list("person") as Person[]) : [];
    if (names.length) {
      use(names);
      await setMeta(CACHE_KEY, JSON.stringify(names)).catch(() => {});
      console.log(`Orrery: ${names.length} road peddlers`);
      return;
    }
    throw new Error(db.lastError || "no road peddlers in the Orrery");
  } catch (e) {
    console.error("Orrery: read failed", String(e));
    // The Orrery's last good list, from before this run.
    if (!merchantNames.length) {
      try {
        const saved = JSON.parse((await getMeta(CACHE_KEY)) || "[]");
        if (Array.isArray(saved) && saved.length) { use(saved.map(String)); console.log(`Orrery: ${saved.length} road peddlers from the last good read`); }
      } catch { /* none saved */ }
    }
  }
}

/** Call from the run loop: re-reads once ORRERY_REFRESH_MS has passed. */
export function refreshFromOrreryIfStale(): void {
  if (Date.now() - lastRead >= ORRERY_REFRESH_MS) refreshFromOrrery();
}
