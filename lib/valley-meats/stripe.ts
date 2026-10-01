// Optional hosted-checkout payment via Stripe (REST, no SDK). Card details are
// entered on Stripe's page — never spoken to the agent.

import { MENU_BY_ID, RESTAURANT } from "./menu";
import { totals, type OrderState } from "./order";

export const onlinePaymentEnabled = () => !!process.env.STRIPE_SECRET_KEY;

export async function createCheckoutUrl(orderId: string, state: OrderState, origin: string): Promise<string> {
  const t = totals(state);
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${origin}/valley-meats?paid=${encodeURIComponent(orderId)}`);
  form.set("cancel_url", `${origin}/valley-meats?unpaid=${encodeURIComponent(orderId)}`);
  form.set("client_reference_id", orderId);
  form.set("metadata[order_id]", orderId);
  let i = 0;
  const line = (name: string, cents: number, qty: number) => {
    form.set(`line_items[${i}][quantity]`, String(qty));
    form.set(`line_items[${i}][price_data][currency]`, "usd");
    form.set(`line_items[${i}][price_data][unit_amount]`, String(cents));
    form.set(`line_items[${i}][price_data][product_data][name]`, name.slice(0, 120));
    i++;
  };
  for (const l of state.cart) {
    const item = MENU_BY_ID.get(l.itemId)!;
    line(`${item.name}${l.option ? ` (${l.option})` : ""}`, item.priceCents, l.quantity);
  }
  if (t.taxCents > 0) line("Sales tax", t.taxCents, 1);
  if (t.deliveryFeeCents > 0) line("Delivery fee", t.deliveryFeeCents, 1);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `${RESTAURANT.name}-${orderId}`,
    },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`stripe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url?.startsWith("https://checkout.stripe.com/")) throw new Error("stripe returned no checkout url");
  return data.url;
}
