// =============================================================================
//  permissions.ts — determines a chatter's role from the `badges` array
//  Twitch's EventSub channel.chat.message event includes on every message,
//  so admin-only commands can be gated to moderators/the broadcaster.
// =============================================================================

export type Role = "broadcaster" | "moderator" | "vip" | "subscriber" | "viewer";

export interface Badge { set_id: string; id: string; info?: string }

export function roleFromBadges(badges: Badge[] | undefined | null): Role {
  const sets = (badges || []).map((b) => b.set_id);
  if (sets.includes("broadcaster")) return "broadcaster";
  if (sets.includes("moderator")) return "moderator";
  if (sets.includes("vip")) return "vip";
  if (sets.includes("subscriber") || sets.includes("founder")) return "subscriber";
  return "viewer";
}

export function isModOrBroadcaster(role: Role): boolean {
  return role === "broadcaster" || role === "moderator";
}
