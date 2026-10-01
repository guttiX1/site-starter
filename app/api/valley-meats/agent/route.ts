import { runAgent, type ChatMessage } from "@/lib/valley-meats/agent";
import { json, rateLimited } from "@/lib/valley-meats/http";
import { sanitizeState, type PlacedOrder } from "@/lib/valley-meats/order";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Where completed orders go. Always logged; optionally POSTed to your POS/kitchen webhook. */
async function submitOrder(order: PlacedOrder) {
  console.log("[valley-meats] ORDER", JSON.stringify(order));
  const url = process.env.ORDER_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.ORDER_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.ORDER_WEBHOOK_SECRET}` } : {}),
    },
    body: JSON.stringify(order),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`order webhook ${res.status}`);
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 503);
  if (rateLimited(req, "agent", 30)) return json({ error: "Too many requests. Please slow down." }, 429);

  let body: { messages?: unknown; state?: unknown };
  try {
    const text = await req.text();
    if (text.length > 20_000) return json({ error: "Request too large." }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 600) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "No user message." }, 400);

  try {
    const { reply, state } = await runAgent(messages, sanitizeState(body.state), {
      origin: process.env.APP_URL || new URL(req.url).origin,
      submitOrder,
    });
    return json({ reply, state });
  } catch (e) {
    console.error("[valley-meats] agent error", e);
    return json({ error: "The assistant is unavailable right now." }, 502);
  }
}
