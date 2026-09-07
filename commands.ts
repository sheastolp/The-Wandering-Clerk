// =============================================================================
//  commands.ts — one async function per player-facing command. Each takes
//  (username, display, args) and returns the reply string.
//  To add a new command: write the function here, then add one line to
//  COMMAND_DEFS at the bottom of twitch.ts.
// =============================================================================
import { Rules, Combat, Inventory, Merchant, Advisor, Util, Character, MonsterLookup } from "./game.ts";
import { QuestBoard } from "./quests.ts";
import * as Store from "./storeClient.ts";

// Checks the current quest board for a bounty on `monsterName`, logs
// `kills` toward it for this character, and auto turns it in (grants
// reward, rerolls that board slot) the moment it's met. Returns a message
// fragment to tack onto the hunt reply, or "" if no quest was touched.
async function applyQuestProgress(c: Character, monsterName: string, kills: number): Promise<string> {
  if (kills <= 0) return "";
  const board = await Store.getQuestBoard();
  const found = QuestBoard.findByMonsterName(board, monsterName);
  if (!found) return "";

  const { quest, index } = found;
  const updated = (c.questProgress[quest.id] || 0) + kills;

  if (updated >= quest.targetCount) {
    c.gold += quest.goldReward;
    let rewardMsg = "+" + quest.goldReward + " gold";
    if (quest.itemReward) {
      Inventory.add(c, quest.itemReward);
      rewardMsg += " and a " + quest.itemReward.name;
    }
    delete c.questProgress[quest.id];
    board[index] = QuestBoard.rollQuest();
    await Store.saveQuestBoard(board);
    return " 📜 Quest complete! The Clerk pays out for the " + quest.monsterName + " bounty — " + rewardMsg + ". A new posting goes up on the board.";
  }

  c.questProgress[quest.id] = updated;
  return " 📜 Quest progress: " + quest.monsterName + " " + updated + "/" + quest.targetCount + ".";
}

const HELP_TEXT =
  "the Clerk's ledger lists: !start quick status + what to do next | !enlist <name|random> to begin | " +
  "!chars (!ledger) sheet | !hunt [monster name] to fight for XP & gold (name one to target it, e.g. \"!hunt wolf\") | " +
  "!autohunt (!auto) chain fights until you level up or need rest | !rest to heal | " +
  "!quests (!board) see the bounty board and your progress | " +
  "!merchant (!shop) see the stall (multiple offers!) | !coinpurse (!purse) check your gold | " +
  "!buy <#|item name> purchase an offer | !inventory (!inv) see your items | " +
  "!use <item> | !drop <item> | !discharge confirm to start over";

export async function help(_username: string, display: string): Promise<string> {
  return "@" + display + " " + HELP_TEXT;
}

export async function start(username: string, display: string): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) {
    return "@" + display + " Ah, a new face at the desk. The Clerk hasn't got you on the rolls yet — !enlist <name> " +
      "or !enlist random to have your name entered, then !hunt (or !autohunt) to begin building a record worth reading. !help for the full ledger.";
  }
  const offers = await Store.getMerchantOffers();
  return "@" + display + " " + Rules.sheetLine(c) + " " + Advisor.recommendNextAction(c, offers);
}

export async function createchar(username: string, display: string, args: string[]): Promise<string> {
  const existing = await Store.getCharacter(username);
  if (existing) {
    return "@" + display + " you already have a character (" + existing.name + ", Level " + existing.level +
      "). Only one character is allowed — use !discharge confirm to release them and roll a new one.";
  }
  const raw = args.join(" ").trim();
  let name: string;
  if (!raw || raw.toLowerCase() === "random") {
    name = Rules.rollRandomName();
  } else if (raw.length > 24) {
    return "@" + display + " that name is too long (24 characters max). Try again, or use \"!enlist random\".";
  } else if (!/^[a-zA-Z' -]+$/.test(raw)) {
    return "@" + display + " names can only use letters, spaces, apostrophes, and hyphens. Try again, or use \"!enlist random\".";
  } else {
    name = raw;
  }
  const character = Rules.createCharacter(username, name);
  await Store.saveCharacter(character);
  const offers = await Store.getMerchantOffers();
  return "@" + display + " the Clerk enters " + character.name + " into the rolls — Level 1 " + character.race.name + " " +
    character.cls.name + ". " + Rules.sheetLine(character) + ". " + Advisor.recommendNextAction(character, offers);
}

export async function character(username: string, display: string): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you don't have a character yet. Start with !enlist <name> or !enlist random.";
  const offers = await Store.getMerchantOffers();
  return "@" + display + " " + Rules.sheetLine(c) + " " + Advisor.recommendNextAction(c, offers);
}

export async function hunt(username: string, display: string, args: string[]): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you need a character first — !enlist <name> or !enlist random.";
  if (c.hp <= 1) {
    return "@" + display + " " + c.name + " is barely standing (" + c.hp + "/" + c.hpMax + " HP) — !rest before hunting again.";
  }

  const targetName = args.join(" ").trim();
  let targetMonster = undefined as ReturnType<typeof MonsterLookup.find>;
  if (targetName) {
    targetMonster = MonsterLookup.find(targetName);
    if (!targetMonster) {
      return "@" + display + " no monster matches \"" + targetName + "\". Check !quests for the board, or !hunt with no name for a random encounter.";
    }
  }

  const result = Combat.huntMonster(c, targetMonster);
  const questMsg = result.won ? await applyQuestProgress(c, result.monster.name, 1) : "";
  await Store.saveCharacter(c);
  const offers = await Store.getMerchantOffers();
  const highlight = result.log.slice(-3).join(", ");
  const rec = Advisor.recommendNextAction(c, offers);
  if (result.won) {
    const levelMsg = result.leveledTo ? " 🎉 Leveled up to " + result.leveledTo + "!" : "";
    return "@" + display + " " + c.name + " took on a " + result.monster.name + " (" + highlight + ") and won! +" +
      result.xpGained + " XP, +" + result.goldGained + " gold. HP " + result.hpLeft + "/" + result.hpMax + "." + levelMsg + questMsg + " " + rec;
  }
  return "@" + display + " " + c.name + " was overwhelmed by a " + result.monster.name + " (" + highlight +
    ") and had to retreat. +" + result.xpGained + " XP for the effort. HP " + result.hpLeft + "/" + result.hpMax + " — " + rec;
}

export async function autohunt(username: string, display: string): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you need a character first — !enlist <name> or !enlist random.";
  if (c.hp <= 1) {
    return "@" + display + " " + c.name + " is barely standing (" + c.hp + "/" + c.hpMax + " HP) — !rest before hunting again.";
  }

  const MAX_HUNTS = 10;
  const startLevel = c.level;
  let hunts = 0, wins = 0, losses = 0, totalXp = 0, totalGold = 0;
  let stopReason = "hit the " + MAX_HUNTS + "-fight safety cap";
  const winsByMonster = new Map<string, number>();

  while (hunts < MAX_HUNTS) {
    const result = Combat.huntMonster(c);
    hunts++;
    totalXp += result.xpGained;
    totalGold += result.goldGained;
    if (result.won) {
      wins++;
      winsByMonster.set(result.monster.name, (winsByMonster.get(result.monster.name) || 0) + 1);
    } else {
      losses++;
    }

    if (result.leveledTo) { stopReason = "leveled up to " + result.leveledTo; break; }
    if (c.hp <= 1) { stopReason = "HP hit critical"; break; }
    if (Advisor.isLowHp(c)) { stopReason = "HP getting low"; break; }
  }

  let questMsg = "";
  for (const [monsterName, kills] of winsByMonster) {
    questMsg += await applyQuestProgress(c, monsterName, kills);
  }

  await Store.saveCharacter(c);
  const offers = await Store.getMerchantOffers();
  const leveledUp = c.level > startLevel;
  const emoji = leveledUp ? " 🎉" : "";
  const summary = "@" + display + " auto-hunted " + hunts + " fight" + (hunts === 1 ? "" : "s") + " (" + wins +
    "W/" + losses + "L): +" + totalXp + " XP, +" + totalGold + " gold. HP " + c.hp + "/" + c.hpMax + ". Stopped: " +
    stopReason + "." + emoji + questMsg;
  return summary + " " + Advisor.recommendNextAction(c, offers);
}

export async function rest(username: string, display: string): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you don't have a character yet.";
  const offers = await Store.getMerchantOffers();
  if (c.hp >= c.hpMax) {
    return "@" + display + " " + c.name + " is already at full health (" + c.hp + "/" + c.hpMax + "). " +
      Advisor.recommendNextAction(c, offers);
  }
  c.hp = c.hpMax;
  await Store.saveCharacter(c);
  return "@" + display + " " + c.name + " rests and recovers to " + c.hp + "/" + c.hpMax + " HP. " +
    Advisor.recommendNextAction(c, offers);
}

export async function quests(username: string, display: string): Promise<string> {
  const c = await Store.getCharacter(username);
  const board = await Store.getQuestBoard();
  const desc = QuestBoard.describeBoard(board, (q) => (c ? c.questProgress[q.id] || 0 : 0));
  const hint = c ? " Say !hunt <monster name> to work one, e.g. \"!hunt " + board[0].monsterName + "\"." :
    " Create a character with !enlist to start logging progress.";
  return "@" + display + " 📜 the Clerk's quest board: " + desc + "." + hint;
}

export async function merchant(_username: string, display: string): Promise<string> {
  const offers = await Store.getMerchantOffers();
  return "@" + display + " 🛒 today's stall: " + Merchant.describeOffers(offers) +
    ". Say !buy <#|item name> to purchase, e.g. \"!buy 1\".";
}

export async function coinpurse(username: string, display: string): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you don't have a character yet, so no purse to check.";
  const offers = await Store.getMerchantOffers();
  const affordable = Merchant.cheapestAffordable(offers, c.gold);
  const purseLine = "@" + display + " " + c.name + "'s coinpurse: " + c.gold + " gold.";
  if (affordable) {
    return purseLine + " Enough for " + affordable.item.name + " (" + affordable.item.price + " gold) at !merchant — !buy it.";
  }
  if (offers.length) {
    const cheapest = offers.reduce((a, b) => (a.item.price <= b.item.price ? a : b));
    const short = cheapest.item.price - c.gold;
    return purseLine + " Need " + short + " more gold for the cheapest stall item (" + cheapest.item.name + "). " +
      Advisor.recommendNextAction(c, offers);
  }
  return purseLine + " " + Advisor.recommendNextAction(c, offers);
}

export async function buy(username: string, display: string, args: string[]): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you need a character first — !enlist <name> or !enlist random.";
  const offers = await Store.getMerchantOffers();
  const needle = args.join(" ").trim();
  if (!needle) {
    return "@" + display + " buy which one? " + Merchant.describeOffers(offers) + " — try \"!buy 1\" or \"!buy <item name>\".";
  }
  const found = Merchant.findOffer(offers, needle);
  if (!found) {
    return "@" + display + " no stall offer matches \"" + needle + "\". Current stall: " + Merchant.describeOffers(offers);
  }
  const offer = found.offer;
  if (c.gold < offer.item.price) {
    return "@" + display + " you need " + offer.item.price + " gold for " + offer.item.name + " but only have " +
      c.gold + ". Go !hunt for more.";
  }
  c.gold -= offer.item.price;
  Inventory.add(c, offer.item);
  offers[found.index] = Merchant.rollOffer(); // only the purchased slot restocks
  await Store.saveCharacter(c);
  await Store.saveMerchantOffers(offers);
  return "@" + display + " bought " + offer.item.name + " from " + offer.merchant + " for " + offer.item.price +
    " gold. Check !inventory, and !use it when ready. That slot has a new offer. " + Advisor.recommendNextAction(c, offers);
}

export async function inventory(username: string, display: string): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you don't have a character yet.";
  if (!c.inventory.length) {
    return "@" + display + " " + c.name + "'s inventory is empty. Try !merchant and !buy.";
  }
  const offers = await Store.getMerchantOffers();
  const list = c.inventory.map((it) => it.name + (it.qty > 1 ? " x" + it.qty : "")).join(", ");
  return "@" + display + " " + c.name + "'s inventory: " + list + ". " + Advisor.recommendNextAction(c, offers);
}

export async function use(username: string, display: string, args: string[]): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you don't have a character yet.";
  const needle = args.join(" ").trim();
  if (!needle) return "@" + display + " use what? Try !use <item name>, e.g. !use potion.";
  const invItem = Inventory.find(c, needle);
  if (!invItem) {
    const have = c.inventory.length ? c.inventory.map((it) => it.name).join(", ") : "(nothing)";
    return "@" + display + " no item matching \"" + needle + "\" in your inventory. You have: " + have;
  }

  let msg: string;
  if (invItem.type === "potion") {
    const heal = invItem.heal!;
    const healed = Util.rollDice(heal[0], heal[1]) + heal[2];
    c.hp = Util.clamp(c.hp + healed, 0, c.hpMax);
    Inventory.removeOne(c, invItem);
    msg = "@" + display + " " + c.name + " drinks the " + invItem.name + " and recovers " + healed + " HP (" + c.hp + "/" + c.hpMax + ").";
  } else if (invItem.type === "weapon") {
    const previous = c.equipped.weapon;
    c.equipped.weapon = invItem;
    Inventory.removeOne(c, invItem);
    if (previous) Inventory.add(c, previous);
    msg = "@" + display + " " + c.name + " equips the " + invItem.name + ".";
  } else if (invItem.type === "armor") {
    const previous = c.equipped.armor;
    c.equipped.armor = invItem;
    Inventory.removeOne(c, invItem);
    if (previous) Inventory.add(c, previous);
    msg = "@" + display + " " + c.name + " puts on the " + invItem.name + ".";
  } else {
    msg = "@" + display + " the " + invItem.name + " is just a trinket — neat, but nothing happens when you use it.";
  }
  await Store.saveCharacter(c);
  const offers = await Store.getMerchantOffers();
  return msg + " " + Advisor.recommendNextAction(c, offers);
}

export async function drop(username: string, display: string, args: string[]): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you don't have a character yet.";
  const needle = args.join(" ").trim();
  if (!needle) return "@" + display + " drop what? Try !drop <item name>.";
  const invItem = Inventory.find(c, needle);
  if (!invItem) {
    const have = c.inventory.length ? c.inventory.map((it) => it.name).join(", ") : "(nothing)";
    return "@" + display + " no item matching \"" + needle + "\" in your inventory. You have: " + have;
  }
  Inventory.removeOne(c, invItem);
  await Store.saveCharacter(c);
  return "@" + display + " dropped " + invItem.name + ".";
}

export async function resetchar(username: string, display: string, args: string[]): Promise<string> {
  const c = await Store.getCharacter(username);
  if (!c) return "@" + display + " you don't have a character to reset.";
  if ((args[0] || "").toLowerCase() !== "confirm") {
    return "@" + display + " the Clerk will strike " + c.name + " from the rolls for good if you're sure — say \"!discharge confirm\".";
  }
  await Store.deleteCharacter(username);
  return "@" + display + " the Clerk closes " + c.name + "'s file. Use !enlist when you're ready to open a new one.";
}

export const Commands: Record<string, (username: string, display: string, args: string[]) => Promise<string>> = {
  help, start, createchar, character, hunt, autohunt, rest, merchant,
  coinpurse, buy, inventory, use, drop, resetchar, quests,
};
