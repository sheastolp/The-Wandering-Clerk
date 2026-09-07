// =============================================================================
//  data.ts — every tunable game table. No logic here, just data, so
//  balancing the game never means touching game.ts / commands.ts.
// =============================================================================

export interface RaceDef { name: string; hpBonus: number }
export interface ClassDef { name: string; hitDie: number; atkBonus: number }
export interface MonsterDef {
  name: string; cr: number; ac: number; hp: number; atk: number;
  dmgDice: number; dmgSides: number; dmgBonus: number;
  xp: number; goldMin: number; goldMax: number;
}
export interface ItemDef {
  key: string; name: string; type: "potion" | "weapon" | "armor" | "trinket";
  price: number; desc: string;
  heal?: [number, number, number]; // [diceCount, diceSides, flatBonus]
  atkBonus?: number;
  acBonus?: number;
}

export const races: RaceDef[] = [
  { name: "Human", hpBonus: 0 },
  { name: "Elf", hpBonus: 0 },
  { name: "Dwarf", hpBonus: 2 },
  { name: "Halfling", hpBonus: 0 },
  { name: "Half-Orc", hpBonus: 1 },
  { name: "Tiefling", hpBonus: 0 },
  { name: "Dragonborn", hpBonus: 1 },
  { name: "Gnome", hpBonus: 0 },
];

export const classes: ClassDef[] = [
  { name: "Fighter", hitDie: 10, atkBonus: 2 },
  { name: "Rogue", hitDie: 8, atkBonus: 2 },
  { name: "Wizard", hitDie: 6, atkBonus: 0 },
  { name: "Cleric", hitDie: 8, atkBonus: 1 },
  { name: "Ranger", hitDie: 10, atkBonus: 1 },
  { name: "Barbarian", hitDie: 12, atkBonus: 2 },
  { name: "Bard", hitDie: 8, atkBonus: 0 },
  { name: "Paladin", hitDie: 10, atkBonus: 1 },
];

export const nameFirst: string[] = [
  "Kaelen", "Thoradin", "Lyra", "Sable", "Varric", "Elowen", "Brannor",
  "Isolde", "Doran", "Fenwick", "Maerwyn", "Corvin", "Sylas", "Thessaly",
  "Grimnir", "Aveline", "Baelor", "Nyx", "Orrin", "Perrin", "Ravenna",
  "Torin", "Wrenna", "Aldric", "Bryn", "Caius", "Delphine", "Eamon",
  "Fira", "Gideon", "Halcyon", "Ione", "Jorah", "Kestrel", "Liora",
  "Marek", "Nadia", "Osric", "Petra", "Quill", "Roswyn", "Soren",
  "Talon", "Ursa", "Vesper", "Wystan", "Yara", "Zephyrine",
];

export const nameEpithet: string[] = [
  "the Bold", "the Quiet", "the Wanderer", "Stormrider", "Ashborn",
  "the Steadfast", "Nightwhisper", "the Reckless", "Ironhand",
  "the Unbroken", "of the Hollow", "Duskwalker", "the Lucky",
  "Ravensworn", "the Grim", "Sunforged", "the Wayward", "Grimoak",
  "the Silent Blade", "Frostmantle", "the Ember-Eyed", "Wolfsbane",
  "the Undaunted", "Thornfield", "the Last Word", "Moonshadow",
];

// Cumulative XP thresholds, 5e-inspired, levels 1-20.
export const xpThresholds: number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000,
  100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export const monsters: MonsterDef[] = [
  // --- Trivial (CR ~0-1/4) ---
  { name: "Giant Rat", cr: 0.125, ac: 10, hp: 6, atk: 2, dmgDice: 1, dmgSides: 4, dmgBonus: 0, xp: 10, goldMin: 0, goldMax: 2 },
  { name: "Stirge", cr: 0.125, ac: 12, hp: 4, atk: 3, dmgDice: 1, dmgSides: 4, dmgBonus: 1, xp: 10, goldMin: 0, goldMax: 1 },
  { name: "Kobold Skirmisher", cr: 0.125, ac: 12, hp: 5, atk: 3, dmgDice: 1, dmgSides: 4, dmgBonus: 1, xp: 15, goldMin: 1, goldMax: 3 },
  { name: "Giant Centipede", cr: 0.125, ac: 11, hp: 6, atk: 2, dmgDice: 1, dmgSides: 4, dmgBonus: 0, xp: 15, goldMin: 0, goldMax: 2 },
  { name: "Goblin Scavenger", cr: 0.25, ac: 13, hp: 8, atk: 3, dmgDice: 1, dmgSides: 6, dmgBonus: 1, xp: 25, goldMin: 1, goldMax: 5 },
  { name: "Twig Blight", cr: 0.25, ac: 13, hp: 7, atk: 2, dmgDice: 1, dmgSides: 4, dmgBonus: 0, xp: 25, goldMin: 0, goldMax: 1 },
  { name: "Skeleton Sentry", cr: 0.25, ac: 13, hp: 9, atk: 3, dmgDice: 1, dmgSides: 6, dmgBonus: 1, xp: 30, goldMin: 1, goldMax: 4 },
  { name: "Flying Snake", cr: 0.25, ac: 14, hp: 5, atk: 4, dmgDice: 1, dmgSides: 4, dmgBonus: 2, xp: 25, goldMin: 0, goldMax: 2 },

  // --- Easy (CR ~1/2-1) ---
  { name: "Zombie Shambler", cr: 0.5, ac: 8, hp: 14, atk: 3, dmgDice: 1, dmgSides: 6, dmgBonus: 1, xp: 50, goldMin: 1, goldMax: 5 },
  { name: "Wolf", cr: 0.5, ac: 13, hp: 11, atk: 4, dmgDice: 2, dmgSides: 4, dmgBonus: 2, xp: 50, goldMin: 0, goldMax: 2 },
  { name: "Giant Wasp", cr: 0.5, ac: 12, hp: 9, atk: 4, dmgDice: 1, dmgSides: 4, dmgBonus: 2, xp: 50, goldMin: 0, goldMax: 2 },
  { name: "Cultist", cr: 0.5, ac: 12, hp: 9, atk: 3, dmgDice: 1, dmgSides: 6, dmgBonus: 1, xp: 50, goldMin: 2, goldMax: 8 },
  { name: "Orc Raider", cr: 1, ac: 13, hp: 15, atk: 5, dmgDice: 1, dmgSides: 8, dmgBonus: 2, xp: 100, goldMin: 3, goldMax: 10 },
  { name: "Gnoll Hunter", cr: 1, ac: 15, hp: 22, atk: 4, dmgDice: 2, dmgSides: 4, dmgBonus: 2, xp: 100, goldMin: 2, goldMax: 8 },
  { name: "Thug", cr: 1, ac: 11, hp: 32, atk: 4, dmgDice: 1, dmgSides: 6, dmgBonus: 2, xp: 100, goldMin: 4, goldMax: 12 },
  { name: "Giant Spider", cr: 1, ac: 14, hp: 26, atk: 5, dmgDice: 2, dmgSides: 8, dmgBonus: 3, xp: 100, goldMin: 2, goldMax: 6 },
  { name: "Dire Wolf", cr: 1, ac: 14, hp: 37, atk: 5, dmgDice: 2, dmgSides: 6, dmgBonus: 3, xp: 100, goldMin: 1, goldMax: 4 },

  // --- Moderate (CR ~2-3) ---
  { name: "Bugbear Ambusher", cr: 2, ac: 16, hp: 27, atk: 5, dmgDice: 2, dmgSides: 8, dmgBonus: 3, xp: 200, goldMin: 5, goldMax: 15 },
  { name: "Ogre Brute", cr: 2, ac: 11, hp: 59, atk: 6, dmgDice: 2, dmgSides: 8, dmgBonus: 4, xp: 200, goldMin: 6, goldMax: 18 },
  { name: "Harpy", cr: 1, ac: 11, hp: 19, atk: 4, dmgDice: 1, dmgSides: 6, dmgBonus: 2, xp: 100, goldMin: 2, goldMax: 6 },
  { name: "Gray Ooze", cr: 2, ac: 8, hp: 22, atk: 5, dmgDice: 2, dmgSides: 6, dmgBonus: 3, xp: 200, goldMin: 0, goldMax: 3 },
  { name: "Displacer Beast", cr: 3, ac: 13, hp: 85, atk: 6, dmgDice: 2, dmgSides: 6, dmgBonus: 4, xp: 450, goldMin: 5, goldMax: 15 },
  { name: "Minotaur Skulker", cr: 3, ac: 14, hp: 76, atk: 6, dmgDice: 2, dmgSides: 8, dmgBonus: 4, xp: 450, goldMin: 8, goldMax: 20 },
  { name: "Wight", cr: 3, ac: 14, hp: 45, atk: 4, dmgDice: 1, dmgSides: 8, dmgBonus: 2, xp: 450, goldMin: 6, goldMax: 16 },
  { name: "Werewolf", cr: 3, ac: 12, hp: 58, atk: 5, dmgDice: 2, dmgSides: 6, dmgBonus: 3, xp: 450, goldMin: 4, goldMax: 14 },

  // --- Dangerous (CR ~4-6) ---
  { name: "Owlbear", cr: 3, ac: 13, hp: 59, atk: 7, dmgDice: 2, dmgSides: 8, dmgBonus: 5, xp: 450, goldMin: 6, goldMax: 18 },
  { name: "Ettin", cr: 4, ac: 12, hp: 85, atk: 7, dmgDice: 2, dmgSides: 8, dmgBonus: 5, xp: 1100, goldMin: 10, goldMax: 25 },
  { name: "Manticore", cr: 3, ac: 14, hp: 68, atk: 6, dmgDice: 2, dmgSides: 8, dmgBonus: 4, xp: 700, goldMin: 8, goldMax: 20 },
  { name: "Black Pudding", cr: 4, ac: 7, hp: 85, atk: 7, dmgDice: 3, dmgSides: 6, dmgBonus: 4, xp: 1100, goldMin: 0, goldMax: 5 },
  { name: "Troll", cr: 5, ac: 15, hp: 84, atk: 7, dmgDice: 2, dmgSides: 6, dmgBonus: 5, xp: 1800, goldMin: 10, goldMax: 30 },
  { name: "Hill Giant", cr: 5, ac: 13, hp: 105, atk: 8, dmgDice: 3, dmgSides: 8, dmgBonus: 5, xp: 1800, goldMin: 15, goldMax: 35 },
  { name: "Wyvern", cr: 6, ac: 13, hp: 110, atk: 8, dmgDice: 2, dmgSides: 8, dmgBonus: 5, xp: 2300, goldMin: 15, goldMax: 40 },
  { name: "Chimera", cr: 6, ac: 14, hp: 114, atk: 8, dmgDice: 2, dmgSides: 6, dmgBonus: 5, xp: 2300, goldMin: 15, goldMax: 40 },

  // --- Deadly (CR ~7-10) ---
  { name: "Stone Giant", cr: 7, ac: 17, hp: 126, atk: 9, dmgDice: 3, dmgSides: 8, dmgBonus: 6, xp: 2900, goldMin: 20, goldMax: 50 },
  { name: "Young Green Dragon", cr: 8, ac: 18, hp: 136, atk: 10, dmgDice: 2, dmgSides: 10, dmgBonus: 6, xp: 3900, goldMin: 30, goldMax: 75 },
  { name: "Hezrou (Demon)", cr: 8, ac: 16, hp: 136, atk: 9, dmgDice: 3, dmgSides: 8, dmgBonus: 6, xp: 3900, goldMin: 20, goldMax: 55 },
  { name: "Fire Giant", cr: 9, ac: 18, hp: 162, atk: 11, dmgDice: 3, dmgSides: 10, dmgBonus: 7, xp: 5000, goldMin: 35, goldMax: 90 },
  { name: "Young Red Dragon", cr: 10, ac: 18, hp: 178, atk: 11, dmgDice: 2, dmgSides: 10, dmgBonus: 7, xp: 5900, goldMin: 40, goldMax: 100 },
  { name: "Aboleth", cr: 10, ac: 17, hp: 135, atk: 9, dmgDice: 2, dmgSides: 6, dmgBonus: 6, xp: 5900, goldMin: 20, goldMax: 60 },

  // --- Legendary (CR ~12+, endgame flavor with no actual "end") ---
  { name: "Frost Giant Jarl", cr: 12, ac: 16, hp: 190, atk: 12, dmgDice: 3, dmgSides: 12, dmgBonus: 8, xp: 8400, goldMin: 50, goldMax: 120 },
  { name: "Adult Black Dragon", cr: 14, ac: 19, hp: 195, atk: 13, dmgDice: 2, dmgSides: 10, dmgBonus: 8, xp: 11500, goldMin: 60, goldMax: 150 },
  { name: "Balor (Demon Lord's Herald)", cr: 19, ac: 19, hp: 262, atk: 14, dmgDice: 3, dmgSides: 10, dmgBonus: 9, xp: 22000, goldMin: 100, goldMax: 250 },
  { name: "Ancient Red Dragon", cr: 24, ac: 22, hp: 546, atk: 17, dmgDice: 2, dmgSides: 10, dmgBonus: 10, xp: 62000, goldMin: 150, goldMax: 400 },
];

export const items: ItemDef[] = [
  // --- Potions ---
  { key: "minor_potion", name: "Potion of Minor Healing", type: "potion", heal: [2, 4, 2], price: 8, desc: "restores 2d4+2 HP when drunk" },
  { key: "greater_potion", name: "Potion of Healing", type: "potion", heal: [4, 6, 4], price: 20, desc: "restores 4d6+4 HP when drunk" },
  { key: "superior_potion", name: "Superior Potion of Healing", type: "potion", heal: [6, 8, 6], price: 40, desc: "restores 6d8+6 HP when drunk" },
  { key: "draught_of_vigor", name: "Draught of Vigor", type: "potion", heal: [3, 4, 3], price: 12, desc: "restores 3d4+3 HP, tastes faintly of cinnamon" },

  // --- Weapons ---
  { key: "rusty_shortsword", name: "Rusty Shortsword", type: "weapon", atkBonus: 1, price: 15, desc: "+1 to hunt rolls while equipped" },
  { key: "iron_longsword", name: "Iron Longsword", type: "weapon", atkBonus: 2, price: 35, desc: "+2 to hunt rolls while equipped" },
  { key: "fine_rapier", name: "Finely Balanced Rapier", type: "weapon", atkBonus: 3, price: 60, desc: "+3 to hunt rolls while equipped" },
  { key: "steel_greataxe", name: "Steel Greataxe", type: "weapon", atkBonus: 4, price: 90, desc: "+4 to hunt rolls while equipped" },
  { key: "ancient_blade", name: "Ancient Blade of Unknown Make", type: "weapon", atkBonus: 5, price: 130, desc: "+5 to hunt rolls while equipped" },

  // --- Armor ---
  { key: "padded_vest", name: "Padded Leather Vest", type: "armor", acBonus: 1, price: 15, desc: "+1 AC while equipped" },
  { key: "chain_shirt", name: "Chain Shirt", type: "armor", acBonus: 2, price: 35, desc: "+2 AC while equipped" },
  { key: "plate_scraps", name: "Salvaged Plate Scraps", type: "armor", acBonus: 3, price: 60, desc: "+3 AC while equipped" },
  { key: "reinforced_plate", name: "Reinforced Plate", type: "armor", acBonus: 4, price: 90, desc: "+4 AC while equipped" },
  { key: "dragonhide_cloak", name: "Dragonhide Cloak", type: "armor", acBonus: 5, price: 130, desc: "+5 AC while equipped" },

  // --- Trinkets (flavor only) ---
  { key: "lucky_coin", name: "Merchant's Lucky Coin", type: "trinket", price: 5, desc: "brings no measurable luck, but it is shiny" },
  { key: "dragon_scale_dyed", name: "'Authentic' Dragon Scale (dyed lizard)", type: "trinket", price: 4, desc: "not a real dragon scale" },
  { key: "chalk_wards", name: "Bundle of Warding Chalk", type: "trinket", price: 3, desc: "mostly unbroken chalk sticks" },
  { key: "cracked_mirror", name: "Cracked Scrying Mirror", type: "trinket", price: 10, desc: "only ever shows yesterday" },
  { key: "owlbear_whiskers", name: "Jar of Pickled Owlbear Whiskers", type: "trinket", price: 6, desc: "for luck, allegedly" },
  { key: "tarnished_locket", name: "Tarnished Locket", type: "trinket", price: 7, desc: "empty; the portrait fell out years ago" },
  { key: "whistling_stone", name: "Whistling Stone", type: "trinket", price: 2, desc: "hums faintly in a strong wind" },
  { key: "moth_eaten_cloak", name: "Moth-Eaten \"Invisibility\" Cloak", type: "trinket", price: 9, desc: "does not, in fact, turn you invisible" },
  { key: "mostly_empty_bag", name: "Bag of Holding (mostly empty)", type: "trinket", price: 18, desc: "holds slightly more than it should" },
  { key: "dubious_map", name: "Dubious Treasure Map", type: "trinket", price: 5, desc: "X marks a spot that is now a well-known bakery" },
];

export const merchantNames: string[] = [
  "Wobble", "Pruneface Yorik", "Tansy Ninefingers", "Old Corrin",
  "Tam Pockets", "Squint", "Nan Gullyfoot", "Kettle", "Sella Windrags",
];

// Story snippets for the periodic "item lore" ambient event (see twitch.ts).
// Templated with {owner} (the merchant hawking it), {item} (item name), and
// {desc} (the item's short flavor description) — filled in at post time,
// keyed by item type so a weapon gets a different flavor of story than a
// trinket. These describe wares currently sitting on the stall.
export const itemStoryTemplates: Record<string, string[]> = {
  potion: [
    "{owner} swears the {item} still smells faintly of the alchemist's cellar where it was brewed.",
    "{owner} won't say where the {item} came from, only that it works — mostly.",
    "According to {owner}, the {item} was mixed during a thunderstorm. Make of that what you will.",
    "{owner} keeps the {item} wrapped in cloth on the cart, just in case it's more fragile than it looks.",
    "{owner} has never actually watched the {item} get made, and has decided it's best not to ask.",
  ],
  weapon: [
    "{owner} claims the {item} saw at least one real battle before it reached the stall.",
    "The {item} on {owner}'s cart has a nick along the edge — {owner} tells a different story about it every time asked.",
    "{owner} insists the {item} balances better than it has any right to for the price.",
    "Nobody's quite sure who owned the {item} before {owner}, least of all {owner}.",
    "{owner} keeps meaning to have the {item} properly appraised. Hasn't happened yet.",
  ],
  armor: [
    "{owner} says the dent in the {item} was already there when it arrived — no questions asked, no answers given.",
    "The {item} {owner} has on offer saw at least one battle before it ever reached the cart.",
    "{owner} keeps meaning to have the {item} properly cleaned up. Hasn't happened yet.",
    "{owner} found a second buckle sewn inside the {item}. Still hasn't figured out why.",
    "The {item} on {owner}'s cart creaks a little in the cold. {owner} calls that character.",
  ],
  trinket: [
    "{owner} isn't entirely sure what the {item} does, only that it seemed worth hauling to market.",
    "{owner} claims the {item} is good luck. The Clerk's ledger shows no evidence either way.",
    "Nobody quite remembers where {owner} got the {item}. {owner} isn't telling.",
    "{owner} has caught themselves talking to the {item} more than once on the road. It has never answered.",
    "{owner} keeps dropping the price on the {item} just to see if anyone will bite. So far, no one has.",
  ],
};
