// =============================================================================
//  quests.ts — the Quest Board. A handful of "hunt N of this monster"
//  bounties that the Clerk posts, tracks per-character, and auto pays out
//  on completion. Kept deliberately minimal: no chains, no NPC dialogue,
//  just objective -> progress -> reward.
// =============================================================================
import { monsters, items, MonsterDef, ItemDef } from "./data.ts";
import { Util } from "./game.ts";

export interface Quest {
  id: string;
  monsterName: string;
  targetCount: number;
  goldReward: number;
  itemReward: ItemDef | null;
  postedAt: number;
}

// Design note: the board is shared (everyone sees the same postings), but
// progress toward a quest is tracked per-character (see Character.questProgress
// in game.ts). Whoever's kill count reaches targetCount first triggers the
// auto turn-in on THEIR character and keeps the reward — even if someone
// else has partial progress on that same quest id. The slot then rerolls
// for everyone, and any leftover progress other players had logged against
// the old quest id simply becomes orphaned and harmless.

export const QuestBoard = {
  SLOT_COUNT: 3,

  // How often the whole board gets swept and re-posted, independent of
  // whether individual quests were completed (see twitch.ts).
  BOARD_REFRESH_MS: 20 * 60 * 1000, // 20 minutes
  BOARD_REFRESH_JITTER_MS: 10 * 60 * 1000, // up to +10 minutes extra

  ITEM_REWARD_CHANCE: 0.35,

  // Keep quest monsters on the easier end of the roster so a bounty is
  // realistically clearable in a normal play session, regardless of the
  // hunter's level (quests bypass the level-matched encounter table).
  eligibleMonsters(): MonsterDef[] {
    return monsters.filter((m) => m.cr <= 3);
  },

  rollQuest(): Quest {
    const pool = QuestBoard.eligibleMonsters();
    const monster = Util.pick(pool);
    const targetCount = Util.clamp(Math.round(6 - monster.cr), 1, 6);
    const goldReward = Math.max(5, Math.round(monster.xp / 4)) + targetCount * 2;
    const itemReward = Math.random() < QuestBoard.ITEM_REWARD_CHANCE ? Util.pick(items) : null;
    return {
      id: crypto.randomUUID(),
      monsterName: monster.name,
      targetCount,
      goldReward,
      itemReward,
      postedAt: Date.now(),
    };
  },

  rollBoard(): Quest[] {
    return Array.from({ length: QuestBoard.SLOT_COUNT }, () => QuestBoard.rollQuest());
  },

  describeQuest(quest: Quest, progress = 0): string {
    const plural = quest.targetCount > 1 ? "s" : "";
    const rewardParts = [quest.goldReward + " gold"];
    if (quest.itemReward) rewardParts.push(quest.itemReward.name);
    const shown = Math.min(progress, quest.targetCount);
    return `Hunt ${quest.targetCount} ${quest.monsterName}${plural} (${shown}/${quest.targetCount}) → ${rewardParts.join(" + ")}`;
  },

  describeBoard(quests: Quest[], progressFor?: (quest: Quest) => number): string {
    return quests
      .map((q, i) => "#" + (i + 1) + " " + QuestBoard.describeQuest(q, progressFor ? progressFor(q) : 0))
      .join(" | ");
  },

  findByMonsterName(quests: Quest[], monsterName: string): { quest: Quest; index: number } | null {
    const idx = quests.findIndex((q) => q.monsterName.toLowerCase() === monsterName.toLowerCase());
    if (idx === -1) return null;
    return { quest: quests[idx], index: idx };
  },
};
