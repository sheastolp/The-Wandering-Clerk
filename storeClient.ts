// =============================================================================
//  storeClient.ts — the bot's view of storage. Calls store.ts directly (same
//  process, same SQLite file as the web side); this used to be an HTTP
//  client for the Val Town val's storage API. Same function names/shapes
//  commands.ts already expects.
// =============================================================================
import { Character, Rules, AutoHuntSession } from "./game.ts";
import * as Db from "./store.ts";

export {
  addChannel,
  deleteCharacter,
  getChannels,
  getMerchantOffers,
  getMeta,
  getQuestBoard,
  removeChannel,
  saveCharacter,
  saveMerchantOffers,
  saveQuestBoard,
  setMeta,
} from "./store.ts";

export async function getCharacter(username: string): Promise<Character | null> {
  const character = await Db.getCharacter(username);
  if (!character) return null;
  if (!character.questProgress) character.questProgress = {};
  const healed = Rules.applyPassiveHealing(character); // catch up on regen since last read
  if (healed) await Db.saveCharacter(character);
  return character;
}

// Same as getChannels, but null on failure instead of [] — for callers that
// must tell "no onboarded channels" apart from "couldn't read the store"
// (e.g. dropping channels that were left/purged from the /admin panel).
export async function fetchChannels(): Promise<string[] | null> {
  try {
    return await Db.getChannels();
  } catch (err) {
    console.error("getChannels failed:", err);
    return null;
  }
}

// Feature toggles set from the moderator-locked /admin panel (web.ts),
// scoped per channel. Keys here must stay in sync with FEATURE_DEFS in
// web.ts.
const FEATURE_KEYS = ["characters", "combat", "shop", "quests", "merchant_ads", "quest_ads", "item_lore", "start_nudge"];

export async function getFeatureFlags(channel: string): Promise<Record<string, boolean>> {
  const raw = await Db.getMeta("feature_flags");
  const stored = raw ? JSON.parse(raw) : {};
  const channelStored = stored[channel.toLowerCase()] || {};
  const flags: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) flags[key] = channelStored[key] !== false; // default: enabled
  return flags;
}

// Timed autohunt sessions — stored as one flat list under a single meta
// key, reusing the same generic key-value store feature_flags already
// uses.
export async function getAutohuntSessions(): Promise<AutoHuntSession[]> {
  const raw = await Db.getMeta("autohunt_sessions");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AutoHuntSession[];
  } catch (err) {
    console.error("getAutohuntSessions parse failed:", err);
    return [];
  }
}

export async function saveAutohuntSessions(sessions: AutoHuntSession[]): Promise<void> {
  await Db.setMeta("autohunt_sessions", JSON.stringify(sessions));
}
