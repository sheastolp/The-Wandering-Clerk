// Gets a fresh access + refresh token for the bot's Twitch account with
// Twitch's device code flow (no redirect URL or web page needed), and writes
// them into the settings file as TWITCH_BOT_ACCESS_TOKEN and
// TWITCH_BOT_REFRESH_TOKEN. Run as root on the laptop:
//
//   deno run -A tools/get_bot_token.ts /etc/tavernworks/clerk.env
//
// It reads TWITCH_CLIENT_ID (and TWITCH_BOT_USERNAME, to check you signed in
// as the right account) from that file. Then restart the bot:
//   systemctl restart tavernworks-clerk

const SCOPES = "user:read:chat user:write:chat user:bot";

const envPath = Deno.args[0] || "/etc/tavernworks/clerk.env";
let text = Deno.readTextFileSync(envPath);
const get = (name: string) => text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";

const clientId = get("TWITCH_CLIENT_ID");
const botUsername = get("TWITCH_BOT_USERNAME").toLowerCase();
if (!clientId) {
  console.error(`Fill in TWITCH_CLIENT_ID in ${envPath} first.`);
  Deno.exit(1);
}

const start = await fetch("https://id.twitch.tv/oauth2/device", {
  method: "POST",
  body: new URLSearchParams({ client_id: clientId, scopes: SCOPES }),
});
if (!start.ok) {
  console.error("Twitch refused to start the sign-in:", start.status, await start.text());
  Deno.exit(1);
}
const device = await start.json();

console.log(`
1. In a browser, sign in to Twitch as the BOT account${botUsername ? ` (${botUsername})` : ""}
   (use a private window if you're signed in as yourself).
2. Open: ${device.verification_uri}
   The code is: ${device.user_code}
3. Press Authorize.

Waiting for you to authorize (this window checks every few seconds)...`);

const deadline = Date.now() + device.expires_in * 1000;
let tokens: any = null;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, (device.interval || 5) * 1000));
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      scopes: SCOPES,
      device_code: device.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.access_token) {
    tokens = body;
    break;
  }
  if (body.message !== "authorization_pending") {
    console.error("Sign-in failed:", res.status, JSON.stringify(body));
    Deno.exit(1);
  }
}
if (!tokens) {
  console.error("The code expired before it was authorized. Run this again.");
  Deno.exit(1);
}

const who = await (await fetch("https://id.twitch.tv/oauth2/validate", {
  headers: { Authorization: `OAuth ${tokens.access_token}` },
})).json();
console.log(`\nSigned in as: ${who.login}  (scopes: ${(who.scopes || []).join(", ")})`);
if (botUsername && who.login !== botUsername) {
  console.error(`That isn't the bot account (${botUsername}). Nothing was saved; run this again signed in as ${botUsername}.`);
  Deno.exit(1);
}

const set = (name: string, value: string) => {
  const line = `${name}=${value}`;
  text = new RegExp(`^${name}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${name}=.*$`, "m"), line)
    : text.replace(/\n?$/, `\n${line}\n`);
};
set("TWITCH_BOT_ACCESS_TOKEN", tokens.access_token);
set("TWITCH_BOT_REFRESH_TOKEN", tokens.refresh_token);
Deno.writeTextFileSync(envPath, text);
console.log(`Saved TWITCH_BOT_ACCESS_TOKEN and TWITCH_BOT_REFRESH_TOKEN to ${envPath}.`);
