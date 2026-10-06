// =============================================================================
//  main.ts (Val Town side) — this val handles two things, both quick
//  request/response and well within Val Town's timeout:
//    1. The one-click broadcaster onboarding pages (/onboard, /oauth/callback)
//    2. A small authenticated REST API over SQLite storage, used by the
//       bot itself — which runs as a scheduled GitHub Actions workflow,
//       not on Val Town, since Val Town can't hold a connection open long
//       enough for a real-time chat bot without a paid plan.
// =============================================================================
//
//
import {
  addChannel,
  deleteCharacter,
  getChannels,
  getCharacter,
  getMerchantOffers,
  getMeta,
  getQuestBoard,
  initStore,
  removeChannel,
  saveCharacter,
  saveMerchantOffers,
  saveQuestBoard,
  setMeta,
} from "./store.ts";
import { exchangeCodeForToken, getAuthorizingUser } from "./helix.ts";

const CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") || "";
const API_SECRET = Deno.env.get("API_SHARED_SECRET") || "";
const HOME_CHANNEL = (Deno.env.get("TWITCH_CHANNEL") || "").toLowerCase()
  .trim();
const ADMIN_USERNAMES = (Deno.env.get("ADMIN_USERNAMES") || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const ADMIN_SESSION_SECRET = Deno.env.get("ADMIN_SESSION_SECRET") || "";

if (!API_SECRET) {
  console.error(
    "Missing API_SHARED_SECRET env var — the storage API will reject every request until this is set.",
  );
}
if (!ADMIN_SESSION_SECRET) {
  console.error(
    "Missing ADMIN_SESSION_SECRET env var — the /admin panel will refuse to issue sessions until this is set.",
  );
}
if (!HOME_CHANNEL) {
  console.error(
    "Missing TWITCH_CHANNEL env var — the /admin panel won't recognize the broadcaster until this is set.",
  );
}

const globalAny = globalThis as any;
if (!globalAny.__huntAndHoardInit) {
  globalAny.__huntAndHoardInit = true;
  await initStore();
  console.log("Hunt & Hoard storage + onboarding service ready.");
}

function redirectUriFor(req: Request): string {
  const url = new URL(req.url);
  const host = url.host.replace(/\/+$/, "");
  return `${url.protocol}//${host}/oauth/callback`;
}

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>The Wandering Clerk</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;text-align:center;line-height:1.5;">${body}</body></html>`,
    { status, headers: { "content-type": "text/html" } },
  );
}

// =============================================================================
// Moderator-locked admin panel — lets the broadcaster or an approved
// moderator turn whole sections of the bot on/off. Locked down with:
//   - Real Twitch sign-in (not just a hidden URL) to establish identity
//   - Server-side allowlist check (broadcaster login, or ADMIN_USERNAMES)
//     — never trust anything the client claims about who they are
//   - A signed, HttpOnly, Secure, SameSite=Strict session cookie (HMAC'd
//     with ADMIN_SESSION_SECRET) so the session can't be forged or read
//     by page scripts
//   - An OAuth `state` nonce (itself in a short-lived signed-equivalent
//     HttpOnly cookie) to prevent CSRF on the sign-in callback
//   - The toggle endpoint only accepts a fixed allowlist of setting keys,
//     and only ever trusts identity from the verified session cookie —
//     never from anything in the submitted form
// =============================================================================

interface FeatureDef {
  key: string;
  label: string;
  description: string;
}

const FEATURE_DEFS: FeatureDef[] = [
  {
    key: "characters",
    label: "Character Enrollment",
    description: "!enlist, !chars / !ledger, !discharge",
  },
  { key: "combat", label: "Combat", description: "!hunt, !autohunt, !rest" },
  {
    key: "shop",
    label: "The Merchant's Stall",
    description:
      "!merchant, !buy, !sell, !coinpurse, !inventory, !item, !use, !drop",
  },
  {
    key: "quests",
    label: "The Quest Board",
    description: "!quests, and bounty auto turn-in from !hunt",
  },
  {
    key: "dice",
    label: "Dice Rolling",
    description: "!d20, !roll",
  },
  {
    key: "merchant_ads",
    label: "Merchant Restock Announcements",
    description: "Periodic stall turnover + chat announcement",
  },
  {
    key: "quest_ads",
    label: "Quest Board Refresh Announcements",
    description: "Periodic bounty board refresh + chat announcement",
  },
  {
    key: "item_lore",
    label: "Item Lore Stories",
    description: "Periodic ambient stories about items on the stall",
  },
  {
    key: "start_nudge",
    label: "Gentle Start Reminders",
    description: "Periodic invitation for newcomers to try !start / !enlist",
  },
];
const FEATURE_KEYS = FEATURE_DEFS.map((d) => d.key);

async function getFeatureFlags(
  channel: string,
): Promise<Record<string, boolean>> {
  const raw = await getMeta("feature_flags");
  const stored = raw ? JSON.parse(raw) : {};
  const channelStored = stored[channel] || {};
  const flags: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) flags[key] = channelStored[key] !== false; // default: enabled
  return flags;
}

async function setFeatureFlag(
  channel: string,
  key: string,
  enabled: boolean,
): Promise<void> {
  const raw = await getMeta("feature_flags");
  const stored = raw ? JSON.parse(raw) : {};
  if (!stored[channel]) stored[channel] = {};
  stored[channel][key] = enabled;
  await setMeta("feature_flags", JSON.stringify(stored));
}

// Used by /admin/leave's purge option: forget a channel's toggles entirely,
// so re-onboarding later starts from the defaults (everything on).
async function removeFeatureFlags(channel: string): Promise<void> {
  const raw = await getMeta("feature_flags");
  if (!raw) return;
  const stored = JSON.parse(raw);
  if (!(channel in stored)) return;
  delete stored[channel];
  await setMeta("feature_flags", JSON.stringify(stored));
}

// Also for the purge option: cancel any timed !autohunt sessions running in
// that channel (the bot keeps them as one flat list under this meta key —
// see getAutohuntSessions in the bot's storeClient.ts).
async function removeAutohuntSessions(channel: string): Promise<void> {
  const raw = await getMeta("autohunt_sessions");
  if (!raw) return;
  const sessions = JSON.parse(raw) as { channel?: string }[];
  const remaining = sessions.filter((s) =>
    (s.channel || "").toLowerCase() !== channel
  );
  if (remaining.length === sessions.length) return;
  await setMeta("autohunt_sessions", JSON.stringify(remaining));
}

// "Super admin" (you, or anyone in ADMIN_USERNAMES) can see and manage
// every channel the Clerk serves. This check needs no storage lookup, so
// it stays sync — callers that only need to know "is this a super admin"
// (e.g. scoping which channels to show) can call it directly.
function isSuperAdmin(login: string): boolean {
  const l = login.toLowerCase();
  return (!!HOME_CHANNEL && l === HOME_CHANNEL) || ADMIN_USERNAMES.includes(l);
}

// Anyone who has onboarded their own channel via /onboard is also allowed
// into /admin — but only to manage that one channel (enforced separately
// at the /admin and /admin/toggle routes below, not here). Without this,
// a legitimate broadcaster who added the Clerk to their own channel would
// sign in successfully and still be told they're "not authorized", since
// they're neither HOME_CHANNEL nor in the static ADMIN_USERNAMES list.
async function isAuthorizedAdmin(login: string): Promise<boolean> {
  const l = login.toLowerCase();
  if (isSuperAdmin(l)) return true;
  const channels = await getChannels();
  return channels.includes(l);
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-")
    .replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const STATE_TTL_SECONDS = 300; // 5 minutes, just long enough to complete the Twitch redirect

async function makeSessionCookie(login: string): Promise<string> {
  const expiry = Date.now() + SESSION_TTL_MS;
  const sig = await hmac(ADMIN_SESSION_SECRET, `${login}.${expiry}`);
  const value = encodeURIComponent(`${login}.${expiry}.${sig}`);
  return `hh_admin_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${
    Math.floor(SESSION_TTL_MS / 1000)
  }`;
}

function clearSessionCookie(): string {
  return `hh_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

async function verifySession(req: Request): Promise<string | null> {
  if (!ADMIN_SESSION_SECRET) return null;
  const raw = getCookie(req, "hh_admin_session");
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [login, expiryStr, sig] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (!expiry || Date.now() > expiry) return null;
  const expected = await hmac(ADMIN_SESSION_SECRET, `${login}.${expiryStr}`);
  if (!timingSafeEqual(sig, expected)) return null;
  if (!(await isAuthorizedAdmin(login))) return null; // re-check allowlist every time, not just at sign-in
  return login;
}

function adminRedirectUriFor(req: Request): string {
  const url = new URL(req.url);
  const host = url.host.replace(/\/+$/, "");
  return `${url.protocol}//${host}/admin/callback`;
}

function adminPage(
  body: string,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>The Clerk's Back Room</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 16px;line-height:1.5;">${body}</body></html>`,
    { status, headers: { "content-type": "text/html", ...extraHeaders } },
  );
}

async function renderAdminSignIn(req: Request): Promise<Response> {
  const state = crypto.randomUUID();
  const authorizeUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", adminRedirectUriFor(req));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "");
  authorizeUrl.searchParams.set("state", state);
  // HttpOnly + Secure + SameSite=Strict already keeps this nonce out of
  // reach of any other site or script; comparing it against what Twitch
  // echoes back in the callback confirms the callback belongs to a flow
  // this same browser actually started (CSRF protection).
  const stateCookie = `hh_admin_state=${
    encodeURIComponent(state)
  }; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${STATE_TTL_SECONDS}`;
  return adminPage(
    `<h1>The Clerk's Back Room</h1>` +
      `<p>Only the broadcaster or an approved moderator may adjust these settings.</p>` +
      `<p><a href="${authorizeUrl.toString()}" style="display:inline-block;padding:12px 24px;background:#9146FF;color:white;` +
      `text-decoration:none;border-radius:6px;font-weight:bold;">Sign in with Twitch</a></p>`,
    200,
    { "set-cookie": stateCookie },
  );
}

function renderAdminDashboard(
  login: string,
  currentChannel: string,
  allChannels: string[],
  flags: Record<string, boolean>,
): Response {
  const channelTabs = allChannels.map((c) => {
    const isCurrent = c === currentChannel;
    const style = isCurrent
      ? "display:inline-block;padding:6px 14px;margin:0 6px 6px 0;background:#9146FF;color:white;border-radius:6px;text-decoration:none;font-weight:bold;"
      : "display:inline-block;padding:6px 14px;margin:0 6px 6px 0;background:#eee;color:#333;border-radius:6px;text-decoration:none;";
    return `<a href="/admin?channel=${
      encodeURIComponent(c)
    }" style="${style}">#${c}</a>`;
  }).join("");

  const rows = FEATURE_DEFS.map((def) => {
    const enabled = flags[def.key];
    const nextValue = enabled ? "0" : "1";
    const statusColor = enabled ? "#2e7a3e" : "#7a2e2e";
    const btnColor = enabled ? "#7a2e2e" : "#2e7a3e";
    const btnLabel = enabled ? "Turn off" : "Turn on";
    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:12px 8px;">
          <strong>${def.label}</strong><br>
          <span style="color:#777;font-size:0.88em;">${def.description}</span>
        </td>
        <td style="text-align:center;padding:12px 8px;white-space:nowrap;">
          <span style="font-weight:bold;color:${statusColor};">${
      enabled ? "ON" : "OFF"
    }</span>
        </td>
        <td style="text-align:right;padding:12px 8px;">
          <form method="POST" action="/admin/toggle" style="margin:0;">
            <input type="hidden" name="channel" value="${currentChannel}">
            <input type="hidden" name="key" value="${def.key}">
            <input type="hidden" name="enabled" value="${nextValue}">
            <button type="submit" style="padding:8px 16px;background:${btnColor};color:white;border:none;border-radius:6px;cursor:pointer;">${btnLabel}</button>
          </form>
        </td>
      </tr>`;
  }).join("");

  // Leave / purge — not offered for the home channel, which the bot always
  // joins from its TWITCH_CHANNEL secret regardless of the stored list.
  const leaveSection = currentChannel === HOME_CHANNEL ? "" : `
    <div style="margin-top:40px;padding:16px 20px;border:1px solid #d9b3b3;border-radius:8px;background:#fcf5f5;">
      <h2 style="margin:0 0 8px;font-size:1.1em;color:#7a2e2e;">Send the Clerk away from #${currentChannel}</h2>
      <p style="margin:0 0 12px;color:#555;font-size:0.92em;">The Clerk stops replying in #${currentChannel} within a few minutes. You can bring it back any time with the <a href="/onboard">invite link</a>. Viewers' characters aren't touched — they follow each viewer to every channel the Clerk serves.</p>
      <form method="POST" action="/admin/leave" style="margin:0;"
        onsubmit="return confirm('Send the Clerk away from #${currentChannel}?');">
        <input type="hidden" name="channel" value="${currentChannel}">
        <label style="display:block;margin-bottom:10px;font-size:0.92em;">
          <input type="checkbox" name="purge" value="1">
          Also purge this channel's saved settings (the toggles above) and cancel any running timed <code>!autohunt</code> sessions here
        </label>
        <label style="display:block;margin-bottom:12px;font-size:0.92em;">
          Type <strong>${currentChannel}</strong> to confirm:
          <input name="confirm" autocomplete="off" required style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;">
        </label>
        <button type="submit" style="padding:8px 16px;background:#7a2e2e;color:white;border:none;border-radius:6px;cursor:pointer;">Leave #${currentChannel}</button>
      </form>
    </div>`;

  return adminPage(
    `<h1>The Clerk's Back Room</h1>` +
      `<p>Signed in as <strong>${login}</strong> — <a href="/admin/logout">sign out</a></p>` +
      `<p style="color:#555;margin-bottom:4px;">Settings for:</p>` +
      `<p style="margin-top:0;">${channelTabs}</p>` +
      `<table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>` +
      `<p style="color:#999;font-size:0.85em;margin-top:24px;">These settings apply only to <strong>#${currentChannel}</strong> — other channels the Clerk serves keep their own. Changes take effect within a few minutes.</p>` +
      leaveSection,
  );
}

interface CommandEntry {
  name: string;
  desc: string;
}
interface CommandSection {
  title: string;
  commands: CommandEntry[];
}

const COMMAND_SECTIONS: CommandSection[] = [
  {
    title: "Getting Started",
    commands: [
      { name: "!help", desc: "The Clerk points you to this very ledger." },
      {
        name: "!start",
        desc: "A quick status check, plus a hint at what to do next.",
      },
      {
        name: "!enlist &lt;name&gt;",
        desc:
          "Have your name entered on the rolls and begin your legend. Try <code>!enlist random</code> if you'd rather the Clerk pick a name for you.",
      },
    ],
  },
  {
    title: "Character &amp; Combat",
    commands: [
      {
        name: "!chars",
        desc:
          "Read your character sheet — level, HP, AC, gold, and gear. <code>!ledger</code> works too.",
      },
      {
        name: "!chars &lt;username&gt;",
        desc:
          "Peek at someone else's sheet instead, e.g. <code>!chars thistle_the_bold</code> (their Twitch username, not their character's name).",
      },
      {
        name: "!hunt",
        desc: "Fight a level-appropriate monster for XP and gold.",
      },
      {
        name: "!hunt &lt;monster name&gt;",
        desc:
          "Seek out a specific monster by name, e.g. <code>!hunt wolf</code> — useful for working a bounty on the Quest Board.",
      },
      {
        name: "!autohunt",
        desc:
          "Chain fights automatically until you level up or need to rest. <code>!auto</code> works too.",
      },
      { name: "!rest", desc: "Recover to full health." },
    ],
  },
  {
    title: "The Merchant's Stall",
    commands: [
      {
        name: "!merchant",
        desc: "See what's currently for sale. <code>!shop</code> works too.",
      },
      {
        name: "!buy &lt;#|item name&gt;",
        desc:
          "Purchase an offer from the stall, e.g. <code>!buy 1</code> or <code>!buy rapier</code>.",
      },
      {
        name: "!sell &lt;item&gt;",
        desc:
          "Sell an item from your pack back to the stall for half its purchase price.",
      },
      {
        name: "!coinpurse",
        desc:
          "Check your gold, and whether you can afford anything on offer. <code>!purse</code> works too.",
      },
      {
        name: "!inventory",
        desc: "See everything you're carrying. <code>!inv</code> works too.",
      },
      {
        name: "!item",
        desc:
          "Look up the full details on whatever you're currently wielding or wearing.",
      },
      {
        name: "!item &lt;item name&gt;",
        desc:
          "Look up any item by name, whether you own it or not, e.g. <code>!item greataxe</code>. <code>!iteminfo</code> works too.",
      },
      {
        name: "!use &lt;item&gt;",
        desc: "Drink a potion, or equip a weapon or armor.",
      },
      { name: "!drop &lt;item&gt;", desc: "Discard an item from your pack." },
    ],
  },
  {
    title: "The Quest Board",
    commands: [
      {
        name: "!quests",
        desc:
          "See the current bounties and your progress toward each. <code>!board</code> or <code>!questboard</code> work too.",
      },
      {
        name: "(auto turn-in)",
        desc:
          "Complete a bounty by hunting its target monster enough times — the reward is paid out the moment it's met, no extra command needed.",
      },
    ],
  },
  {
    title: "Starting Over",
    commands: [
      {
        name: "!discharge confirm",
        desc:
          "Retire your current character for good, so you can enlist a new one. The Clerk asks you to confirm first if you just say <code>!discharge</code>.",
      },
    ],
  },
  {
    title: "For Moderators &amp; the Broadcaster",
    commands: [
      {
        name: "!clerkchannels",
        desc: "List every channel the Clerk currently serves. Open to anyone.",
      },
      {
        name: "!clerkjoin &lt;channel&gt;",
        desc:
          "Have the Clerk set up a desk in another channel. That channel's broadcaster must have already granted permission via the one-click invite link.",
      },
      {
        name: "!clerkleave &lt;channel&gt;",
        desc: "Stop the Clerk from replying in a channel.",
      },
    ],
  },
];

function commandsGuidePage(): Response {
  const sectionsHtml = COMMAND_SECTIONS.map((section) => `
    <section class="guide-section">
      <h2>${section.title}</h2>
      <dl>
        ${
    section.commands.map((c) => `
          <dt>${c.name}</dt>
          <dd>${c.desc}</dd>
        `).join("")
  }
      </dl>
    </section>
  `).join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Wandering Clerk's Ledger</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Cinzel+Decorative:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --parchment: #ecdbb4;
    --parchment-dark: #dcc593;
    --ink: #4a3521;
    --ink-faded: #6b5335;
    --accent: #7a2e2e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 16px 80px;
    background: radial-gradient(ellipse at center, var(--parchment) 0%, var(--parchment-dark) 100%);
    font-family: 'IM Fell English', Georgia, serif;
    color: var(--ink);
  }
  .scroll {
    max-width: 720px;
    margin: 0 auto;
    background: var(--parchment);
    border: 2px solid var(--ink-faded);
    outline: 8px solid var(--parchment);
    outline-offset: -14px;
    box-shadow:
      0 0 0 1px var(--ink-faded),
      0 10px 40px rgba(0,0,0,0.35),
      inset 0 0 60px rgba(122, 92, 46, 0.25);
    padding: 48px 40px 56px;
    position: relative;
  }
  .scroll::before, .scroll::after {
    content: "❧";
    display: block;
    text-align: center;
    font-size: 28px;
    color: var(--accent);
    margin: 0 0 8px;
  }
  .scroll::after { margin: 24px 0 0; }
  h1 {
    font-family: 'Cinzel Decorative', 'IM Fell English', serif;
    text-align: center;
    font-size: 2.1rem;
    letter-spacing: 1px;
    color: var(--accent);
    margin: 0 0 4px;
  }
  .subtitle {
    text-align: center;
    font-style: italic;
    color: var(--ink-faded);
    margin: 0 0 32px;
    font-size: 1.05rem;
  }
  .guide-section { margin-bottom: 30px; }
  .guide-section h2 {
    font-family: 'Cinzel Decorative', 'IM Fell English', serif;
    font-size: 1.15rem;
    color: var(--accent);
    border-bottom: 1px solid var(--ink-faded);
    padding-bottom: 6px;
    margin-bottom: 14px;
    letter-spacing: 0.5px;
  }
  dl { margin: 0; }
  dt {
    font-weight: bold;
    font-size: 1.05rem;
    color: var(--ink);
    margin-top: 14px;
  }
  dt code, dd code {
    font-family: inherit;
    font-style: italic;
    background: rgba(122, 92, 46, 0.12);
    padding: 1px 5px;
    border-radius: 3px;
  }
  dd {
    margin: 4px 0 0;
    color: var(--ink-faded);
    line-height: 1.5;
  }
  .footer-note {
    text-align: center;
    margin-top: 36px;
    font-style: italic;
    color: var(--ink-faded);
    font-size: 0.95rem;
  }
</style>
</head>
<body>
  <div class="scroll">
    <h1>The Wandering Clerk's Ledger</h1>
    <p class="subtitle">Being a Complete Charter of Commands for Hunt &amp; Hoard</p>
    ${sectionsHtml}
    <p class="footer-note">Type any command in chat, exactly as written, to use it.</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isAuthorized(req: Request): boolean {
  return !!API_SECRET &&
    req.headers.get("authorization") === `Bearer ${API_SECRET}`;
}

export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/{2,}/g, "/");

  if (path === "/commands") {
    return commandsGuidePage();
  }

  // --- Moderator-locked admin panel ---
  if (path === "/admin") {
    const login = await verifySession(req);
    if (!login) return renderAdminSignIn(req);
    const extraChannels = await getChannels();
    const allChannels = [
      HOME_CHANNEL,
      ...extraChannels.filter((c) => c !== HOME_CHANNEL),
    ];
    // A channel's own broadcaster only gets a tab for their own channel;
    // only super admins (you, or ADMIN_USERNAMES) can browse every channel
    // the Clerk serves.
    const visibleChannels = isSuperAdmin(login)
      ? allChannels
      : allChannels.filter((c) => c === login);
    const requested = (url.searchParams.get("channel") || "").toLowerCase();
    const currentChannel = visibleChannels.includes(requested)
      ? requested
      : (visibleChannels[0] || HOME_CHANNEL);
    const flags = await getFeatureFlags(currentChannel);
    return renderAdminDashboard(login, currentChannel, visibleChannels, flags);
  }

  if (path === "/admin/callback") {
    const error = url.searchParams.get("error");
    if (error) {
      return adminPage(`<h1>Sign-in cancelled</h1><p>${error}</p>`, 400);
    }

    const returnedState = url.searchParams.get("state");
    const expectedState = getCookie(req, "hh_admin_state");
    const clearStateCookie =
      `hh_admin_state=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0`;
    if (
      !returnedState || !expectedState ||
      !timingSafeEqual(returnedState, expectedState)
    ) {
      return adminPage(
        `<h1>Sign-in failed</h1><p>Couldn't verify this sign-in request. Go back to /admin and try again.</p>`,
        400,
        { "set-cookie": clearStateCookie },
      );
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return adminPage(
        `<h1>Missing authorization code</h1><p>Go back to /admin and try again.</p>`,
        400,
        { "set-cookie": clearStateCookie },
      );
    }

    const token = await exchangeCodeForToken(code, adminRedirectUriFor(req));
    if (!token) {
      return adminPage(
        `<h1>Something went wrong</h1><p>Couldn't complete sign-in with Twitch. Try again in a moment.</p>`,
        500,
        { "set-cookie": clearStateCookie },
      );
    }

    const user = await getAuthorizingUser(token.access_token);
    if (!user) {
      return adminPage(
        `<h1>Something went wrong</h1><p>Couldn't identify your Twitch account.</p>`,
        500,
        { "set-cookie": clearStateCookie },
      );
    }

    if (!(await isAuthorizedAdmin(user.login))) {
      return adminPage(
        `<h1>Not authorized</h1><p>Signed in as ${user.display_name}, but this account isn't set up as a moderator or the broadcaster for this bot. If that's wrong, ask the bot owner to add you.</p>`,
        403,
        { "set-cookie": clearStateCookie },
      );
    }

    const sessionCookie = await makeSessionCookie(user.login);
    const headers = new Headers({ location: "/admin" });
    headers.append("set-cookie", sessionCookie);
    headers.append("set-cookie", clearStateCookie);
    return new Response(null, { status: 302, headers });
  }

  if (path === "/admin/logout") {
    const headers = new Headers({ location: "/admin" });
    headers.set("set-cookie", clearSessionCookie());
    return new Response(null, { status: 302, headers });
  }

  if (path === "/admin/toggle") {
    if (req.method !== "POST") {
      return adminPage(`<h1>Method not allowed</h1>`, 405);
    }
    const login = await verifySession(req);
    if (!login) {
      return adminPage(
        `<h1>Session expired</h1><p>Please <a href="/admin">sign in again</a>.</p>`,
        401,
      );
    }

    const form = await req.formData();
    const channel = String(form.get("channel") || "").toLowerCase();
    const key = String(form.get("key") || "");
    const extraChannels = await getChannels();
    const allChannels = [
      HOME_CHANNEL,
      ...extraChannels.filter((c) => c !== HOME_CHANNEL),
    ];
    if (!allChannels.includes(channel)) {
      return adminPage(`<h1>Unknown channel</h1>`, 400);
    }
    if (!isSuperAdmin(login) && channel !== login) {
      return adminPage(`<h1>Not authorized for that channel</h1>`, 403);
    }
    if (!FEATURE_KEYS.includes(key)) {
      return adminPage(`<h1>Unknown setting</h1>`, 400);
    }
    const enabled = String(form.get("enabled")) === "1";
    await setFeatureFlag(channel, key, enabled);
    return new Response(null, {
      status: 303,
      headers: { location: `/admin?channel=${encodeURIComponent(channel)}` },
    });
  }

  // Same lock-down as /admin/toggle: POST only, identity only from the
  // verified session cookie (SameSite=Strict, so no cross-site POSTs), and
  // a channel's own broadcaster may only remove their own channel.
  if (path === "/admin/leave") {
    if (req.method !== "POST") {
      return adminPage(`<h1>Method not allowed</h1>`, 405);
    }
    const login = await verifySession(req);
    if (!login) {
      return adminPage(
        `<h1>Session expired</h1><p>Please <a href="/admin">sign in again</a>.</p>`,
        401,
      );
    }

    const form = await req.formData();
    const channel = String(form.get("channel") || "").toLowerCase();
    const backLink = `<p><a href="/admin?channel=${
      encodeURIComponent(channel)
    }">Back to the Back Room</a></p>`;
    if (channel === HOME_CHANNEL) {
      return adminPage(
        `<h1>That's the Clerk's home</h1><p>The home channel can't be removed from here.</p>${backLink}`,
        400,
      );
    }
    const extraChannels = await getChannels();
    if (!extraChannels.includes(channel)) {
      return adminPage(`<h1>Unknown channel</h1>${backLink}`, 400);
    }
    if (!isSuperAdmin(login) && channel !== login) {
      return adminPage(`<h1>Not authorized for that channel</h1>`, 403);
    }
    const confirmed = String(form.get("confirm") || "").trim().toLowerCase()
      .replace(/^#/, "");
    if (confirmed !== channel) {
      return adminPage(
        `<h1>Nothing changed</h1><p>The confirmation didn't match <strong>${channel}</strong>, so the Clerk is staying put.</p>${backLink}`,
        400,
      );
    }

    const purge = String(form.get("purge")) === "1";
    await removeChannel(channel);
    if (purge) {
      await removeFeatureFlags(channel);
      await removeAutohuntSessions(channel);
    }

    const summary = `<h1>The Clerk has packed up its desk</h1>` +
      `<p>The Clerk will stop replying in <strong>#${channel}</strong> within a few minutes.` +
      (purge
        ? ` Its saved settings for that channel have been purged and any timed hunts there cancelled.`
        : ` Its settings for that channel are kept, in case you invite it back.`) +
      `</p>`;
    // A broadcaster who just removed their own channel is no longer on the
    // allowlist (isAuthorizedAdmin), so end their session instead of
    // bouncing them to a sign-in page that would refuse them.
    if (!isSuperAdmin(login)) {
      return adminPage(
        summary +
          `<p>Changed your mind? <a href="/onboard">Invite the Clerk back</a>.</p>`,
        200,
        { "set-cookie": clearSessionCookie() },
      );
    }
    return adminPage(
      summary + `<p><a href="/admin">Back to the Back Room</a></p>`,
    );
  }

  // --- Step 1: broadcaster lands here and clicks the single "Authorize" button ---
  if (path === "/onboard") {
    const authorizeUrl = new URL("https://id.twitch.tv/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", redirectUriFor(req));
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "channel:bot");
    return page(
      `<h1>Bring The Wandering Clerk to your channel</h1>` +
        `<p>Click below and log in as the broadcaster of the channel you want the Clerk to serve. ` +
        `This only grants permission for the bot to read and post in your chat — nothing else.</p>` +
        `<p><a href="${authorizeUrl.toString()}" style="display:inline-block;padding:12px 24px;background:#9146FF;color:white;` +
        `text-decoration:none;border-radius:6px;font-weight:bold;">Authorize The Wandering Clerk</a></p>`,
    );
  }

  // --- Step 2: Twitch redirects back here with a code once they authorize ---
  if (path === "/oauth/callback") {
    const error = url.searchParams.get("error");
    if (error) {
      return page(`<h1>Authorization cancelled</h1><p>${error}</p>`, 400);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return page(
        `<h1>Missing authorization code</h1><p>Try the onboarding link again.</p>`,
        400,
      );
    }

    const token = await exchangeCodeForToken(code, redirectUriFor(req));
    if (!token) {
      return page(
        `<h1>Something went wrong</h1><p>Couldn't complete authorization with Twitch. Try again in a moment.</p>`,
        500,
      );
    }

    const user = await getAuthorizingUser(token.access_token);
    if (!user) {
      return page(
        `<h1>Something went wrong</h1><p>Couldn't identify your Twitch account.</p>`,
        500,
      );
    }

    await addChannel(user.login, user.login);
    return page(
      `<h1>You're all set, ${user.display_name}!</h1>` +
        `<p>The Wandering Clerk checks for new channels every few minutes while it's running. ` +
        `Watch your chat for a message, or try typing <code>!help</code>.</p>`,
    );
  }

  // --- Storage API for the GitHub Actions-hosted bot process ---
  if (path.startsWith("/api/")) {
    if (!isAuthorized(req)) return json({ error: "unauthorized" }, 401);

    if (path === "/api/merchant") {
      if (req.method === "GET") return json(await getMerchantOffers());
      if (req.method === "PUT") {
        await saveMerchantOffers(await req.json());
        return json({ ok: true });
      }
    }

    if (path === "/api/quests") {
      if (req.method === "GET") return json(await getQuestBoard());
      if (req.method === "PUT") {
        await saveQuestBoard(await req.json());
        return json({ ok: true });
      }
    }

    if (path === "/api/channels") {
      if (req.method === "GET") return json(await getChannels());
      if (req.method === "POST") {
        const body = await req.json();
        await addChannel(body.channel, body.addedBy);
        return json({ ok: true });
      }
    }

    const channelMatch = path.match(/^\/api\/channels\/([^/]+)$/);
    if (channelMatch && req.method === "DELETE") {
      await removeChannel(decodeURIComponent(channelMatch[1]));
      return json({ ok: true });
    }

    const charMatch = path.match(/^\/api\/characters\/([^/]+)$/);
    if (charMatch) {
      const username = decodeURIComponent(charMatch[1]);
      if (req.method === "GET") {
        const c = await getCharacter(username);
        return c ? json(c) : json({ error: "not found" }, 404);
      }
      if (req.method === "PUT") {
        await saveCharacter(await req.json());
        return json({ ok: true });
      }
      if (req.method === "DELETE") {
        await deleteCharacter(username);
        return json({ ok: true });
      }
    }

    const metaMatch = path.match(/^\/api\/meta\/([^/]+)$/);
    if (metaMatch) {
      const key = decodeURIComponent(metaMatch[1]);
      if (req.method === "GET") {
        const value = await getMeta(key);
        return value === null
          ? json({ error: "not found" }, 404)
          : json({ value });
      }
      if (req.method === "PUT") {
        const body = await req.json();
        await setMeta(key, String(body.value));
        return json({ ok: true });
      }
    }

    return json({ error: "not found" }, 404);
  }

  return new Response(
    "GuildBreak: Hunt & Hoard storage + onboarding service is running.",
    {
      status: 200,
      headers: { "content-type": "text/plain" },
    },
  );
}
