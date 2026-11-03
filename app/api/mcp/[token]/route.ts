// Buckets MCP server: stateless Streamable HTTP, JSON responses.
// The secret token in the URL identifies the user; the database checks it on every call.
import { NextResponse, type NextRequest } from "next/server";
import { TOOLS, ToolError, callTool, verifyToken } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS =
  "Buckets is the user's personal finance app. Use get_overview before answering questions about their money or before changing anything, so you use exact account and goal names. Amounts are in SGD unless the overview says otherwise. When the user tells you a new balance, call update_balances; for a month's income, call log_month. Confirm what changed in one short sentence.";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg: Rpc, token: string) {
  const id = msg.id;
  switch (msg.method) {
    case "initialize": {
      await verifyToken(token);
      const asked = msg.params?.protocolVersion;
      return ok(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "buckets", title: "Buckets", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      try {
        const r = await callTool(token, name, msg.params?.arguments ?? {});
        return ok(id, { content: [{ type: "text", text: r.text }], structuredContent: r.data as object });
      } catch (e) {
        const text = e instanceof ToolError ? e.message : "Something went wrong saving that. Try again.";
        if (!(e instanceof ToolError)) console.error("[mcp] tool error", name, e);
        return ok(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  const list = Array.isArray(body) ? body : [body];
  const out: unknown[] = [];
  for (const msg of list) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") { out.push(fail(null, -32600, "Invalid request")); continue; }
    const isNotification = msg.id === undefined || msg.id === null;
    try {
      const r = await handle(msg, token);
      if (!isNotification) out.push(r);
    } catch (e) {
      const m = e instanceof ToolError ? e.message : "Server error";
      if (msg.method === "initialize" && e instanceof ToolError) return NextResponse.json(fail(msg.id, -32001, m), { status: 401 });
      if (!isNotification) out.push(fail(msg.id, -32603, m));
    }
  }
  if (!out.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return new NextResponse("This connector uses POST. Add its link as a custom connector in Claude.", { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
