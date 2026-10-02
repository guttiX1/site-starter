// Delivers a placed order to the people who must act on it. Several channels can be enabled at once:
//  - ORDER_WEBHOOK_URL            JSON POST to your POS / kitchen system
//  - ORDER_SLACK_WEBHOOK_URL      Slack or Discord incoming webhook (a readable ticket in a channel)
//  - RESEND_API_KEY + ORDER_EMAIL_TO (+ ORDER_EMAIL_FROM)   email via Resend
// An order counts as delivered if at least one channel succeeds. In production with NO channel configured
// the order is refused instead of being silently logged, so a customer is never told "placed" when no one was notified.

import { RESTAURANT } from "./menu";
import type { PlacedOrder } from "./order";

export function channelsConfigured(): string[] {
  const c: string[] = [];
  if (process.env.ORDER_WEBHOOK_URL) c.push("webhook");
  if (process.env.ORDER_SLACK_WEBHOOK_URL) c.push("chat");
  if (process.env.RESEND_API_KEY && process.env.ORDER_EMAIL_TO) c.push("email");
  return c;
}

export function ticketText(o: PlacedOrder): string {
  const x = o.order;
  const money = (n: number) => `$${n.toFixed(2)}`;
  return [
    `NEW ORDER ${o.orderId} — ${String(x.fulfillment).toUpperCase()} — ${o.paymentStatus === "awaiting_online_payment" ? "ONLINE PAYMENT PENDING (do not start until paid)" : "PAY IN PERSON"}`,
    `Name: ${x.customerName}   Phone: ${x.customerPhone}`,
    ...(x.deliveryAddress ? [`Deliver to: ${x.deliveryAddress}`] : []),
    "Items:",
    ...x.items.map((i) => `  - ${i}`),
    `Subtotal ${money(x.subtotal)}  Tax ${money(x.tax)}${x.deliveryFee ? `  Delivery ${money(x.deliveryFee)}` : ""}  TOTAL ${money(x.total)}`,
    `Placed: ${o.placedAt}`,
  ].join("\n");
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function deliverOrder(o: PlacedOrder): Promise<void> {
  const jobs: { name: string; run: () => Promise<void> }[] = [];

  if (process.env.ORDER_WEBHOOK_URL) {
    jobs.push({
      name: "webhook",
      run: () =>
        post(process.env.ORDER_WEBHOOK_URL!, o, process.env.ORDER_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.ORDER_WEBHOOK_SECRET}` } : {}),
    });
  }
  if (process.env.ORDER_SLACK_WEBHOOK_URL) {
    const text = ticketText(o);
    // "text" for Slack, "content" for Discord.
    jobs.push({ name: "chat", run: () => post(process.env.ORDER_SLACK_WEBHOOK_URL!, { text, content: text.slice(0, 1900) }) });
  }
  if (process.env.RESEND_API_KEY && process.env.ORDER_EMAIL_TO) {
    jobs.push({
      name: "email",
      run: () =>
        post(
          "https://api.resend.com/emails",
          {
            from: process.env.ORDER_EMAIL_FROM || `${RESTAURANT.name} Orders <onboarding@resend.dev>`,
            to: process.env.ORDER_EMAIL_TO!.split(",").map((s) => s.trim()).filter(Boolean),
            subject: `New order ${o.orderId} — ${o.order.fulfillment}`,
            text: ticketText(o),
          },
          { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        ),
    });
  }

  if (jobs.length === 0) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOG_ONLY_ORDERS !== "1") {
      throw new Error("No order delivery channel is configured; refusing to place the order.");
    }
    console.log("[valley-meats] ORDER (log only)", JSON.stringify(o));
    return;
  }

  const results = await Promise.allSettled(jobs.map((j) => j.run()));
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${jobs[i].name}: ${(r.reason as Error).message}`] : []));
  if (failed.length) console.error("[valley-meats] order delivery problems", o.orderId, failed.join("; "));
  if (failed.length === jobs.length) throw new Error("All order delivery channels failed.");
  console.log("[valley-meats] ORDER delivered", o.orderId, `${jobs.length - failed.length}/${jobs.length} channels`);
}
