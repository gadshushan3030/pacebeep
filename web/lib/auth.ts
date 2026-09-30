import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { pool } from "./db";

export const MCP_RESOURCE = `${process.env.BETTER_AUTH_URL}/mcp`;

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Set SIGNUP_ENABLED=false to close registration on a deployment.
    disableSignUp: process.env.SIGNUP_ENABLED === "false",
  },
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
