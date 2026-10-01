import { requireMcpAuth } from "@better-auth/mcp";
import { auth, MCP_RESOURCE } from "@/lib/auth";
import { sql } from "@/lib/db";

type Caller = { userId: string; clientId: string; scopes: string[] };

// Bearer-token routes: /mcp for assistants and /api/* for the iPhone app, both OAuth clients of
// the same server. requireMcpAuth verifies the JWT (signature via JWKS, issuer, audience =
// MCP_RESOURCE, expiry) and answers 401 + WWW-Authenticate otherwise. On top of that the token's
// client must still hold this user's consent: disconnecting on the dashboard deletes it and cuts
// access at once.
export function withBearer(handler: (request: Request, caller: Caller) => Response | Promise<Response>) {
  return requireMcpAuth(
    auth,
    async (request, claims) => {
      const clientId = String(claims.azp ?? claims.client_id ?? "");
      const [consent] = await sql('select 1 from "oauthConsent" where "userId" = $1 and "clientId" = $2', [claims.sub, clientId]);
      if (!consent) {
        return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "connection revoked" }, id: null }, {
          status: 401,
          headers: { "WWW-Authenticate": `Bearer resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource/mcp", error="invalid_token"` },
        });
      }
      return handler(request, {
        userId: String(claims.sub),
        clientId,
        scopes: String(claims.scope ?? "").split(" ").filter(Boolean),
      });
    },
    { resource: MCP_RESOURCE },
  );
}
