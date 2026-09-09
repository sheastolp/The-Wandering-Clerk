// =============================================================================
//  helix.ts — small Helix API client. This bot uses the modern chat stack
//  (EventSub for reading, Helix REST for sending) instead of legacy IRC.
// =============================================================================

const CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") || "";
const REFRESH_TOKEN = Deno.env.get("TWITCH_BOT_REFRESH_TOKEN") || "";
let currentAccessToken = Deno.env.get("TWITCH_BOT_ACCESS_TOKEN") || "";

if (!CLIENT_ID) {
  console.error("Missing TWITCH_CLIENT_ID env var.");
}
if (!currentAccessToken && !REFRESH_TOKEN) {
  console.error("Missing both TWITCH_BOT_ACCESS_TOKEN and TWITCH_BOT_REFRESH_TOKEN — the bot has no way to authenticate.");
}

const BASE = "https://api.twitch.tv/helix";

function authHeaders(): HeadersInit {
let appAccessToken = "";
let appAccessTokenExpiresAt = 0;

async function getAppAccessToken(): Promise<string> {
  if (appAccessToken && Date.now() < appAccessTokenExpiresAt - 60_000) return appAccessToken;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, { method: "POST" });
  if (!res.ok) {
    console.error("getAppAccessToken failed:", res.status, await res.text());
    throw new Error("Could not obtain app access token");
  }
  const json = await res.json();
  appAccessToken = json.access_token;
  appAccessTokenExpiresAt = Date.now() + json.expires_in * 1000;
  return appAccessToken;
}

export async function sendChatMessage(broadcasterId: string, senderId: string, text: string): Promise<void> {
  const appToken = await getAppAccessToken();
  const res = await fetch(`${BASE}/chat/messages`, {
    method: "POST",
    headers: {
      "Client-Id": CLIENT_ID,
      "Authorization": `Bearer ${appToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: senderId, message: text, for_source_only: true }),
  });
  if (!res.ok) {
    console.error("sendChatMessage HTTP failure:", res.status, await res.text());
    return;
  }
  const json = await res.json();
  const result = json.data?.[0];
  if (result && result.is_sent === false) {
    console.error("sendChatMessage was NOT delivered — drop_reason:", result.drop_reason?.message || "(none given)");
  }
}
  return {
    "Client-Id": CLIENT_ID,
    "Authorization": `Bearer ${currentAccessToken}`,
    "Content-Type": "application/json",
  };
}

// Twitch user access tokens expire (typically ~4 hours) but refresh
// tokens don't, so this can be called as often as needed. Called
// proactively at startup and periodically during long runs (see
// twitch.ts), and reactively whenever a call comes back 401 — matching
// Twitch's own recommended pattern (see helixFetch below).
export async function refreshAccessToken(): Promise<boolean> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error("Cannot refresh access token — missing TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, or TWITCH_BOT_REFRESH_TOKEN.");
    return false;
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, { method: "POST" });
  if (!res.ok) {
    console.error("refreshAccessToken failed:", res.status, await res.text());
    return false;
  }
  const json = await res.json();
  currentAccessToken = json.access_token;
  console.log("Refreshed the bot's Twitch access token.");
  return true;
}

// Wraps fetch with Twitch's recommended pattern: on a 401, refresh the
// token once and retry the request before giving up.
async function helixFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
    }
  }
  return res;
}

export interface HelixUser { id: string; login: string; display_name: string }

const userCache = new Map<string, HelixUser>();

export async function getUser(login: string): Promise<HelixUser | null> {
  const key = login.toLowerCase();
  if (userCache.has(key)) return userCache.get(key)!;
  const res = await helixFetch(`${BASE}/users?login=${encodeURIComponent(key)}`);
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
  const res = await helixFetch(`${BASE}/eventsub/subscriptions`, {
    method: "POST",
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
  const res = await helixFetch(`${BASE}/chat/messages`, {
    method: "POST",
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

// Checks which of the given channels are currently live, in a single
// batched call (Twitch's Get Streams endpoint accepts multiple
// user_login params at once). Used to keep the Clerk's unprompted,
// periodic chat lines quiet in channels that aren't streaming.
export async function getLiveChannels(logins: string[]): Promise<Set<string>> {
  if (!logins.length) return new Set();
  const params = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
  const res = await helixFetch(`${BASE}/streams?${params}`);
  if (!res.ok) {
    console.error("getLiveChannels failed:", res.status, await res.text());
    return new Set();
  }
  const json = await res.json();
  const live = new Set<string>();
  for (const stream of json.data || []) {
    if (stream.user_login) live.add(String(stream.user_login).toLowerCase());
  }
  return live;
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
