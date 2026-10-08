// One-time move of the Clerk's data off the old huntandhoardbot val, into
// the local store (DB_PATH). Run it on the laptop with the new bot stopped,
// while the val still answers:
//
//   OLD_API_BASE_URL=https://huntandhoardbot.val.run \
//   OLD_API_SECRET=<the val's API_SHARED_SECRET> \
//   VAL_TOWN_API_KEY=<a Val Town API token> \
//   deno task import-db
//
// 1. Channels, the merchant's stall, the quest board, feature toggles,
//    autohunt sessions and timers come over the val's own storage API.
// 2. That API has no "list every character" call, so characters are found
//    by reading the val's SQLite tables over Val Town's API and keeping every
//    row that holds a character sheet (a JSON object with username, race and
//    cls), then Val Town blob storage the same way. Add --file <export.sqlite>
//    to read a downloaded copy of the val's database instead.
//
// Nothing on Val Town is changed. Running it twice is safe (rows are upserted).

import { DatabaseSync } from "node:sqlite";
import * as Store from "../store.ts";
import type { Character } from "../game.ts";

const argv = Deno.args;
const fileIdx = argv.indexOf("--file");
const file = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;

const base = (Deno.env.get("OLD_API_BASE_URL") || "https://huntandhoardbot.val.run").replace(/\/+$/, "");
const secret = Deno.env.get("OLD_API_SECRET") || "";
const META_KEYS = [
  "feature_flags",
  "autohunt_sessions",
  "last_item_story_at",
  "last_merchant_restock_at",
  "last_quest_refresh_at",
  "last_start_nudge_at",
];

async function api(path: string): Promise<any> {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${secret}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return await res.json();
}

await Store.initStore();

if (!secret) {
  console.warn("OLD_API_SECRET not set: skipping channels, stall, quests and settings.");
} else {
  const channels: string[] = (await api("/api/channels")) ?? [];
  for (const ch of channels) await Store.addChannel(ch, "import");
  console.log(`channels: ${channels.length}`);
  const offers = await api("/api/merchant");
  if (Array.isArray(offers) && offers.length) await Store.saveMerchantOffers(offers);
  const quests = await api("/api/quests");
  if (Array.isArray(quests) && quests.length) await Store.saveQuestBoard(quests);
  console.log(`stall: ${offers?.length ?? 0} offer(s), quest board: ${quests?.length ?? 0} bounty(ies)`);
  for (const key of META_KEYS) {
    const body = await api(`/api/meta/${key}`);
    if (body && typeof body.value === "string") {
      await Store.setMeta(key, body.value);
      console.log(`setting ${key}: copied`);
    }
  }
}

// --- characters ---
type Query = (sql: string) => Promise<{ columns: string[]; rows: unknown[][] }>;

function fileQuery(path: string): Query {
  const db = new DatabaseSync(path, { readOnly: true } as any);
  return (sql) => {
    const st = db.prepare(sql);
    const columns = st.columns().map((c) => c.name);
    return Promise.resolve({ columns, rows: st.all().map((r: any) => columns.map((c) => r[c])) });
  };
}

function valTownQuery(): Query | null {
  const key = Deno.env.get("VAL_TOWN_API_KEY");
  if (!key) return null;
  return async (sql) => {
    const res = await fetch("https://api.val.town/v1/sqlite/execute", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ statement: { sql, args: [] } }),
    });
    if (!res.ok) throw new Error(`Val Town API: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    return { columns: body.columns, rows: body.rows };
  };
}

function isCharacter(o: any): o is Character {
  return !!o && typeof o === "object" && typeof o.username === "string" && !!o.race && !!o.cls;
}

function asCharacter(v: unknown): Character | null {
  if (typeof v !== "string" || !v.startsWith("{")) return null;
  try {
    const o = JSON.parse(v);
    return isCharacter(o) ? o : null;
  } catch {
    return null;
  }
}

/** Character sheets inside a parsed JSON value: the value itself, or the items/values of a list or map of them. */
function charactersIn(v: unknown): Character[] {
  if (isCharacter(v)) return [v];
  const items = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
  return items.filter(isCharacter);
}

let totalCharacters = 0;
const query = file ? fileQuery(file) : valTownQuery();
if (!query) {
  console.warn("No VAL_TOWN_API_KEY or --file: characters were not copied.");
} else {
  const tables = (await query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows
    .map((r) => String(r[0]));
  let found = 0;
  for (const table of tables) {
    const q = `"${table.replaceAll('"', '""')}"`;
    for (let offset = 0; ; offset += 500) {
      const page = await query(`SELECT * FROM ${q} LIMIT 500 OFFSET ${offset}`);
      for (const row of page.rows) {
        for (const cell of row) {
          const c = asCharacter(cell);
          if (c) {
            await Store.saveCharacter(c);
            found++;
            break;
          }
        }
      }
      if (page.rows.length < 500) break;
    }
  }
  console.log(`characters: ${found}`);
  totalCharacters += found;
  if (found === 0) console.log("(none in the account database; checking blob storage next)");
}
// Val Town blob storage (std/blob), the other place a val keeps data.
const blobKey = Deno.env.get("VAL_TOWN_API_KEY");
if (blobKey) {
  const auth = { Authorization: `Bearer ${blobKey}` };
  const list = await fetch("https://api.val.town/v1/blob", { headers: auth });
  if (!list.ok) {
    console.warn(`Couldn't list Val Town blobs: HTTP ${list.status} ${await list.text()}`);
  } else {
    const blobs = (await list.json()) as { key: string; size?: number }[];
    console.log(`blobs: ${blobs.length} (${blobs.map((b) => b.key).slice(0, 15).join(", ")}${blobs.length > 15 ? ", ..." : ""})`);
    let fromBlobs = 0;
    for (const b of blobs) {
      if ((b.size ?? 0) > 20_000_000) continue;
      const res = await fetch(`https://api.val.town/v1/blob/${encodeURIComponent(b.key)}`, { headers: auth });
      if (!res.ok) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await res.text());
      } catch {
        continue;
      }
      for (const c of charactersIn(parsed)) {
        await Store.saveCharacter(c);
        fromBlobs++;
      }
    }
    console.log(`characters from blobs: ${fromBlobs}`);
    totalCharacters += fromBlobs;
  }
}
if (totalCharacters === 0) {
  console.warn(
    "No character sheets found. Don't switch the val off yet: check where its store.ts keeps them " +
      "(spot-check one with GET " + base + "/api/characters/<name>).",
  );
}
console.log(`Done: ${Store.DB_PATH}`);
