// =============================================================================
//  helix.ts — small Helix API client. This bot uses the modern chat stack
//  (EventSub for reading, Helix REST for sending) instead of legacy IRC.
// =============================================================================

const CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") || "";
const BOT_TOKEN = Deno.env.get("TWITCH_BOT_ACCESS_TOKEN") || "";

if (!CLIENT_ID || !BOT_TOKEN) {
  console.error("Missing TWITCH_CLIENT_ID or TWITCH_BOT_ACCESS_TOKEN env vars.");
}

const BASE = "https://api.twitch.tv/helix";

function authHeaders(): HeadersInit {
  return {
    "Client-Id": CLIENT_ID,
    "Authorization": `Bearer ${BOT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export interface HelixUser { id: string; login: string; display_name: string }

const userCache = new Map<string, HelixUser>();

export async function getUser(login: string): Promise<HelixUser | null> {
  const key = login.toLowerCase();
  if (userCache.has(key)) return userCache.get(key)!;
  const res = await fetch(`${BASE}/users?login=${encodeURIComponent(key)}`, { headers: authHeaders() });
  if (!res.ok) {
    console.error("getUser failed:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const user = json.data?.[0] as HelixUser | undefined;
  if (!user) return null;
  userCache.set(key, user);
  return user;
}

// Subscribes the bot (user_id) to chat messages in a given channel
// (broadcaster_user_id) over the already-open EventSub WebSocket session.
// This call fails with 403 if that broadcaster hasn't granted this
// Client ID the channel:bot permission (see setup steps).
export async function createChatMessageSubscription(broadcasterId: string, botId: string, sessionId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/eventsub/subscriptions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      type: "channel.chat.message",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId, user_id: botId },
      transport: { method: "websocket", session_id: sessionId },
    }),
  });
  if (!res.ok) {
    console.error("createChatMessageSubscription failed:", res.status, await res.text());
    return false;
  }
  return true;
}

export async function sendChatMessage(broadcasterId: string, senderId: string, text: string): Promise<void> {
  const res = await fetch(`${BASE}/chat/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: senderId, message: text }),
  });
  if (!res.ok) {
    console.error("sendChatMessage HTTP failure:", res.status, await res.text());
    return;
  }
  const json = await res.json();
  const result = json.data?.[0];
  // Twitch can return 200 OK and still silently drop the message — e.g.
  // AutoMod held it, or a chat mode (slow/unique/followers-only) blocked
  // a non-moderator bot. Surface that instead of failing silently.
  if (result && result.is_sent === false) {
    console.error("sendChatMessage was NOT delivered — drop_reason:", result.drop_reason?.message || "(none given)");
  }
}

// -----------------------------------------------------------------------
// One-click broadcaster onboarding (Authorization Code flow). A broadcaster
// clicking the /onboard link authorizes just the channel:bot scope; we
// exchange the resulting code for a short-lived token, use it only to
// identify who authorized (their user id/login), then discard it — the
// bot keeps running on its own long-lived TWITCH_BOT_ACCESS_TOKEN.
// -----------------------------------------------------------------------
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ access_token: string } | null> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, { method: "POST" });
  if (!res.ok) {
    console.error("exchangeCodeForToken failed:", res.status, await res.text());
    return null;
  }
  return await res.json();
}

export async function getAuthorizingUser(accessToken: string): Promise<HelixUser | null> {
  const res = await fetch(`${BASE}/users`, {
    headers: { "Client-Id": CLIENT_ID, "Authorization": `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error("getAuthorizingUser failed:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return (json.data?.[0] as HelixUser) ?? null;
}
