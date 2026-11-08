// The MCP server is built per request; a schema that throws in buildServer takes down every
// call with a bare 500 (zod 4 refused plan_week's extend of a refined object, 8.11.2026).
// Needs no database: initialize and tools/list never query.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildServer } from "@/lib/mcp";

const handler = createMcpHandler(({ authInfo }) => buildServer(String(authInfo?.extra?.userId)));

async function rpc(body: object, sessionId?: string) {
  const res = await handler.fetch(
    new Request("http://pacebeep.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", ...body }),
    }),
    { authInfo: { token: "", clientId: "test", scopes: [], extra: { userId: "00000000-0000-0000-0000-000000000000" } } },
  );
  // Answers arrive as JSON or, once a session exists, as one SSE "data:" line.
  const text = await res.text();
  const data = text.split("\n").find((l) => l.startsWith("data: "));
  return { res, body: JSON.parse(data ? data.slice(6) : text) };
}

test("MCP server initializes and lists its tools", async () => {
  const init = await rpc({ id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  assert.equal(init.res.status, 200, JSON.stringify(init.body));
  const sessionId = init.res.headers.get("mcp-session-id") ?? undefined;
  const list = await rpc({ id: 2, method: "tools/list", params: {} }, sessionId);
  assert.equal(list.res.status, 200, JSON.stringify(list.body));
  const names = list.body.result.tools.map((t: { name: string }) => t.name);
  for (const name of ["get_summary", "create_workout", "plan_week", "update_workout", "record_run"]) assert.ok(names.includes(name), name);
  const planWeek = list.body.result.tools.find((t: { name: string }) => t.name === "plan_week");
  assert.deepEqual(planWeek.inputSchema.properties.workouts.items.required?.includes("scheduled_for"), true);
});
