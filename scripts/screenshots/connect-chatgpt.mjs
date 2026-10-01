// Connects a "ChatGPT" OAuth client to the local demo account through the real flow (DCR, PKCE, consent),
// so the dashboard's "Connected" list shows it. usage: PB_EMAIL=… PB_PASSWORD=… node connect-chatgpt.mjs
import { createHash, randomBytes } from "node:crypto";
const BASE = "http://localhost:3201", REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const creds = { email: process.env.PB_EMAIL, password: process.env.PB_PASSWORD };
const login = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(creds) });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const client = await (await fetch(`${BASE}/api/auth/oauth2/register`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) })).json();
const verifier = randomBytes(32).toString("base64url");
const url = new URL(`${BASE}/api/auth/oauth2/authorize`);
Object.entries({ response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, scope: "openid offline_access", state: "s",
  code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", resource: `${BASE}/mcp` }).forEach(([k, v]) => url.searchParams.set(k, v));
const authz = await fetch(url, { headers: { cookie }, redirect: "manual" });
const consentUrl = new URL(authz.headers.get("location") ?? JSON.parse(await authz.text()).url, BASE);
const p = new URLSearchParams(consentUrl.search), names = new Set(p.getAll("ba_param")), signed = new URLSearchParams();
for (const [k, v] of p) if (k === "sig" || k === "ba_param" || names.has(k)) signed.append(k, v);
const consent = await fetch(`${BASE}/api/auth/oauth2/consent`, { method: "POST", headers: { "content-type": "application/json", cookie, origin: BASE }, body: JSON.stringify({ accept: true, oauth_query: signed.toString() }) });
console.log("ChatGPT connected:", consent.status, client.client_id ? "ok" : JSON.stringify(client));
