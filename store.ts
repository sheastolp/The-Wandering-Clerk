// =============================================================================
//  store.ts — the Clerk's storage: a local SQLite file on the Yoga laptop
//  (DB_PATH, default ./data/clerk.sqlite), opened with Deno's built-in
//  node:sqlite. Replaces the Val Town val's SQLite store; the web side
//  (web.ts) and the bot (storeClient.ts) both call it directly, in one
//  process.
//
//  Tables: characters (one JSON document per username), channels (the
//  onboarded channel list) and kv (merchant offers, the quest board and
//  every getMeta/setMeta key).
// =============================================================================
import { DatabaseSync } from "node:sqlite";
import { Character, Merchant, MerchantOffer } from "./game.ts";
import { Quest, QuestBoard } from "./quests.ts";

export const DB_PATH = Deno.env.get("DB_PATH") || "./data/clerk.sqlite";

let db: DatabaseSync | null = null;

function open(): DatabaseSync {
  if (db) return db;
  if (DB_PATH.includes("/")) Deno.mkdirSync(DB_PATH.slice(0, DB_PATH.lastIndexOf("/")), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS characters (username TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS channels (channel TEXT PRIMARY KEY, added_by TEXT, added_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

function kvGet(key: string): string | null {
  const row = open().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

function kvSet(key: string, value: string): void {
  open().prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** Creates the tables and stocks the stall and the quest board the first time. */
export async function initStore(): Promise<void> {
  open();
  if (kvGet("merchant_offers") === null) kvSet("merchant_offers", JSON.stringify(Merchant.rollOffers()));
  if (kvGet("quest_board") === null) kvSet("quest_board", JSON.stringify(QuestBoard.rollBoard()));
}

export async function getCharacter(username: string): Promise<Character | null> {
  const row = open().prepare("SELECT data FROM characters WHERE username = ?").get(username.toLowerCase()) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as Character) : null;
}

export async function saveCharacter(character: Character): Promise<void> {
  open().prepare(
    "INSERT INTO characters (username, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  ).run(character.username.toLowerCase(), JSON.stringify(character), Date.now());
}

export async function deleteCharacter(username: string): Promise<void> {
  open().prepare("DELETE FROM characters WHERE username = ?").run(username.toLowerCase());
}

export async function getMerchantOffers(): Promise<MerchantOffer[]> {
  const raw = kvGet("merchant_offers");
  return raw ? (JSON.parse(raw) as MerchantOffer[]) : [];
}

export async function saveMerchantOffers(offers: MerchantOffer[]): Promise<void> {
  kvSet("merchant_offers", JSON.stringify(offers));
}

export async function getQuestBoard(): Promise<Quest[]> {
  const raw = kvGet("quest_board");
  return raw ? (JSON.parse(raw) as Quest[]) : [];
}

export async function saveQuestBoard(quests: Quest[]): Promise<void> {
  kvSet("quest_board", JSON.stringify(quests));
}

export async function getChannels(): Promise<string[]> {
  const rows = open().prepare("SELECT channel FROM channels ORDER BY added_at").all() as { channel: string }[];
  return rows.map((r) => r.channel);
}

export async function addChannel(channel: string, addedBy: string): Promise<void> {
  open().prepare("INSERT OR IGNORE INTO channels (channel, added_by, added_at) VALUES (?, ?, ?)")
    .run(channel.toLowerCase().replace(/^#/, ""), addedBy, Date.now());
}

export async function removeChannel(channel: string): Promise<void> {
  open().prepare("DELETE FROM channels WHERE channel = ?").run(channel.toLowerCase().replace(/^#/, ""));
}

export async function getMeta(key: string): Promise<string | null> {
  return kvGet("meta:" + key);
}

export async function setMeta(key: string, value: string): Promise<void> {
  kvSet("meta:" + key, value);
}
