import { provider, runAgent, type ChatMessage } from "@/lib/valley-meats/agent";
import { budgetExceeded, crossSite, json, rateLimited } from "@/lib/valley-meats/http";
import { RESTAURANT } from "@/lib/valley-meats/menu";
import { deliverOrder } from "@/lib/valley-meats/orders-out";
import { sanitizeState, type PlacedOrder } from "@/lib/valley-meats/order";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (crossSite(req)) return json({ error: "Forbidden." }, 403);
  if (provider() === "anthropic" && !process.env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not configured." }, 503);
  if (await rateLimited(req, "agent", 30)) return json({ error: "Too many requests. Please slow down." }, 429);
  // Global daily ceiling on paid AI calls, so a bot or a bug can't run up the bill.
  if (await budgetExceeded("ai", Number(process.env.DAILY_AI_CALL_LIMIT) || 2000)) {
    return json({ error: `We're very busy right now. Please call us at ${RESTAURANT.phone} to order.` }, 503);
  }

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

  // Placing an order is the sensitive step: cap it per client, then deliver to the kitchen. Throwing makes the
  // agent report failure (and the order is NOT marked placed).
  const submitOrder = async (order: PlacedOrder) => {
    if (await rateLimited(req, "order", 3, 60 * 60_000)) throw new Error("order rate limit");
    await deliverOrder(order);
  };

  try {
    const { reply, state } = await runAgent(messages, sanitizeState(body.state), {
      origin: process.env.APP_URL || new URL(req.url).origin,
      submitOrder,
    });
    return json({ reply, state });
  } catch (e) {
    console.error("[valley-meats] agent error", e);
    // Local-model setup errors are actionable ("run ollama pull ...") and contain no secrets.
    const hint = provider() !== "anthropic" && e instanceof Error ? e.message : "The assistant is unavailable right now.";
    return json({ error: hint }, 502);
  }
}
