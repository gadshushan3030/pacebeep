import { createMcpHandler } from "@modelcontextprotocol/server";
import { withBearer } from "@/lib/bearer";
import { buildServer } from "@/lib/mcp";

const handler = createMcpHandler(({ authInfo }) => buildServer(String(authInfo?.extra?.userId)));

const protectedHandler = withBearer((request, { userId, clientId, scopes }) =>
  handler.fetch(request, { authInfo: { token: "", clientId, scopes, extra: { userId } } }),
);

export { protectedHandler as GET, protectedHandler as POST, protectedHandler as DELETE };
