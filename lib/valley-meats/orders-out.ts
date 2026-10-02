// Delivers a placed order to the people who must act on it. Several channels can be enabled at once:
//  - ORDER_WEBHOOK_URL            JSON POST to your POS / kitchen system
//  - ORDER_SLACK_WEBHOOK_URL      Slack or Discord incoming webhook (a readable ticket in a channel)
//  - RESEND_API_KEY + ORDER_EMAIL_TO (+ ORDER_EMAIL_FROM)   email via Resend (optional)
//  - TWILIO_* + ORDER_SMS_TO      SMS to the kitchen/owner phone(s) via Twilio
// Separately, with CUSTOMER_SMS=1 the customer gets a text receipt (best-effort: never blocks or fails the order).
// An order counts as delivered if at least one channel succeeds. In production with NO channel configured
// the order is refused instead of being silently logged, so a customer is never told "placed" when no one was notified.

import { RESTAURANT } from "./menu";
import { budgetExceeded } from "./http";
import type { PlacedOrder } from "./order";

export function channelsConfigured(): string[] {
  const c: string[] = [];
  if (process.env.ORDER_WEBHOOK_URL) c.push("webhook");
  if (process.env.ORDER_SLACK_WEBHOOK_URL) c.push("chat");
  if (process.env.RESEND_API_KEY && process.env.ORDER_EMAIL_TO) c.push("email");
  if (twilioReady() && process.env.ORDER_SMS_TO) c.push("sms");
  return c;
}

// ---- SMS (Twilio REST, no SDK) ---------------------------------------------

const twilioReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
export const customerSmsEnabled = () => process.env.CUSTOMER_SMS === "1" && twilioReady();

/** Normalize to E.164. US numbers (10 digits, or 11 starting with 1) get +1. Returns null if it doesn't look valid. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const from = process.env.TWILIO_FROM!;
  const form = new URLSearchParams({ To: to, Body: body.slice(0, 1500) });
  // A Messaging Service SID (MG...) or a plain phone number both work.
  form.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
  const base = (process.env.TWILIO_API_BASE || "https://api.twilio.com").replace(/\/$/, "");
  const res = await fetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function receiptText(o: PlacedOrder): string {
  const x = o.order;
  const items = x.items.length > 4 ? [...x.items.slice(0, 4), `+${x.items.length - 4} more`] : x.items;
  const pay =
    o.paymentStatus === "awaiting_online_payment" && o.paymentUrl ? `Pay online: ${o.paymentUrl}` : "Pay in person.";
  const eta = RESTAURANT.prepMinutes[x.fulfillment === "delivery" ? "delivery" : "pickup"];
  return `${RESTAURANT.name}: order ${o.orderId} received (${x.fulfillment}, ready in ~${eta} min). ${items.join("; ")}. Total $${x.total.toFixed(2)}. ${pay} Questions? ${RESTAURANT.phone}`;
}

/** Best-effort text receipt to the customer. Never throws: the order is already placed. */
async function sendCustomerReceipt(o: PlacedOrder): Promise<void> {
  try {
    const to = o.order.customerPhone ? toE164(o.order.customerPhone) : null;
    if (!to) return console.warn("[valley-meats] customer SMS skipped: phone not recognized", o.orderId);
    if (await budgetExceeded("sms", Number(process.env.DAILY_SMS_LIMIT) || 200)) return console.warn("[valley-meats] customer SMS skipped: daily SMS cap reached");
    await sendSms(to, receiptText(o));
  } catch (e) {
    console.error("[valley-meats] customer SMS failed", o.orderId, (e as Error).message);
  }
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

  if (twilioReady() && process.env.ORDER_SMS_TO) {
    const text = ticketText(o);
    const numbers = process.env.ORDER_SMS_TO.split(",").map((n) => toE164(n.trim())).filter((n): n is string => !!n);
    if (numbers.length) {
      jobs.push({
        name: "sms",
        run: async () => {
          const r = await Promise.allSettled(numbers.map((n) => sendSms(n, text)));
          if (r.every((x) => x.status === "rejected")) throw new Error("all SMS failed");
        },
      });
    }
  }

  if (jobs.length === 0) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOG_ONLY_ORDERS !== "1") {
      throw new Error("No order delivery channel is configured; refusing to place the order.");
    }
    console.log("[valley-meats] ORDER (log only)", JSON.stringify(o));
    if (customerSmsEnabled()) await sendCustomerReceipt(o);
    return;
  }

  const results = await Promise.allSettled(jobs.map((j) => j.run()));
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${jobs[i].name}: ${(r.reason as Error).message}`] : []));
  if (failed.length) console.error("[valley-meats] order delivery problems", o.orderId, failed.join("; "));
  if (failed.length === jobs.length) throw new Error("All order delivery channels failed.");
  console.log("[valley-meats] ORDER delivered", o.orderId, `${jobs.length - failed.length}/${jobs.length} channels`);
  if (customerSmsEnabled()) await sendCustomerReceipt(o);
}
