import { mcp } from "@better-auth/mcp";
import { createPrivateKey, sign } from "node:crypto";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { pool } from "./db";

export const MCP_RESOURCE = `${process.env.BETTER_AUTH_URL}/mcp`;

// "Continue with Google" is on when both variables are set.
export const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// "Continue with Apple" is on when all four are set (Apple Developer → Certificates, IDs & Profiles).
export const appleEnabled = !!(
  process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY
);
const signupClosed = process.env.SIGNUP_ENABLED === "false";

// Apple's client secret is a JWT signed with the .p8 key, valid for 6 months at most. Minted here
// on every cold start, so it can't expire in production the way a pasted one would, silently.
function appleClientSecret() {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const env = process.env;
  const data = `${part({ alg: "ES256", kid: env.APPLE_KEY_ID })}.${part({
    iss: env.APPLE_TEAM_ID, iat: now, exp: now + 150 * 86400, aud: "https://appleid.apple.com", sub: env.APPLE_CLIENT_ID,
  })}`;
  // Vercel keeps the .p8's newlines; a one-line paste with literal "\n" works too.
  const key = createPrivateKey(env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  return `${data}.${sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // With Google or Apple on, new accounts come only from them (a verified email). Otherwise
    // someone could register a password account on your email first and keep that password after
    // you link Google. Password sign-in keeps working for existing accounts.
    disableSignUp: signupClosed || googleEnabled || appleEnabled,
  },
  socialProviders: {
    ...(googleEnabled && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account" as const,
        disableSignUp: signupClosed,
      },
    }),
    // Required by App Store guideline 4.8 next to Google. Apple's emails are verified, so an
    // Apple sign-in with the email of an existing account joins it, like Google's below.
    ...(appleEnabled && {
      apple: { clientId: process.env.APPLE_CLIENT_ID!, clientSecret: appleClientSecret(), disableSignUp: signupClosed },
    }),
  },
  // Apple returns to /api/auth/callback/apple with a POST from its own origin (form_post).
  ...(appleEnabled && { trustedOrigins: ["https://appleid.apple.com"] }),
  // A Google sign-in with the email of an existing account joins that account.
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  // "Delete account" on the dashboard. Workouts, runs, feedback, sessions and assistant
  // connections go with it (foreign keys cascade from "user").
  user: { deleteUser: { enabled: true } },
  // Session-to-JWT endpoint isn't used; OAuth access tokens come from mcp().
  disabledPaths: ["/token"],
  plugins: [
    jwt(),
    // OAuth 2.1 server for agents: tokens are bound to MCP_RESOURCE (aud).
    // ChatGPT registers itself (dynamic client registration); each user approves on /oauth/consent.
    mcp({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      resource: MCP_RESOURCE,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    nextCookies(),
  ],
});
