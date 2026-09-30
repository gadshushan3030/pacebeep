import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { pool } from "./db";

export const MCP_RESOURCE = `${process.env.BETTER_AUTH_URL}/mcp`;

// "Continue with Google" is on when both variables are set.
export const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const signupClosed = process.env.SIGNUP_ENABLED === "false";

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // With Google on, new accounts come only from Google (a verified email). Otherwise someone
    // could register a password account on your email first and keep that password after you
    // link Google. Password sign-in keeps working for existing accounts.
    disableSignUp: signupClosed || googleEnabled,
  },
  ...(googleEnabled && {
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account" as const,
        disableSignUp: signupClosed,
      },
    },
  }),
  // A Google sign-in with the email of an existing account joins that account.
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
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
