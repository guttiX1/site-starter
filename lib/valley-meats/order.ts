// Order state + pure operations. The client holds the state between turns, so
// everything here treats it as untrusted: prices are always recomputed from
// the menu and the input is sanitized.

import { MENU, MENU_BY_ID, RESTAURANT, openStatus } from "./menu";

export type CartLine = { itemId: string; quantity: number; option?: string; notes?: string };

export type OrderState = {
  cart: CartLine[];
  fulfillment?: "pickup" | "delivery";
  deliveryAddress?: string;
  customerName?: string;
  customerPhone?: string;
  /** "in_person" = pay at pickup / to the driver; "online" = hosted Stripe checkout link. */
  payment?: "in_person" | "online";
  /** Fingerprint of the order the agent last read back to the customer. */
  readBackHash?: string;
  /** Set once the order has been placed; the cart is then frozen. */
  placed?: { orderId: string; totalCents: number; etaMinutes: number; paymentUrl?: string };
};

export const EMPTY_ORDER: OrderState = { cart: [] };

const MAX_LINE_QTY = 20;
const MAX_LINES = 30;

export function sanitizeState(raw: unknown): OrderState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  const cart: CartLine[] = [];
  if (Array.isArray(r.cart)) {
    for (const l of r.cart.slice(0, MAX_LINES)) {
      const line = l as Record<string, unknown>;
      const item = typeof line?.itemId === "string" ? MENU_BY_ID.get(line.itemId) : undefined;
      const qty = Number(line?.quantity);
      if (!item || !Number.isInteger(qty) || qty < 1) continue;
      const option = str(line.option, 40);
      cart.push({
        itemId: item.id,
        quantity: Math.min(qty, MAX_LINE_QTY),
        option: option && item.options?.includes(option) ? option : undefined,
        notes: str(line.notes, 140),
      });
    }
  }
  const placed = r.placed as OrderState["placed"] | undefined;
  return {
    cart,
    fulfillment: r.fulfillment === "pickup" || r.fulfillment === "delivery" ? r.fulfillment : undefined,
    deliveryAddress: str(r.deliveryAddress, 200),
    customerName: str(r.customerName, 60),
    customerPhone: str(r.customerPhone, 30),
    payment: r.payment === "in_person" || r.payment === "online" ? r.payment : undefined,
    readBackHash: str(r.readBackHash, 64),
    // Trust `placed` only for freezing the cart; it carries no authority.
    placed:
      placed && typeof placed.orderId === "string"
        ? {
            orderId: placed.orderId.slice(0, 20),
            totalCents: Number(placed.totalCents) || 0,
            etaMinutes: Number(placed.etaMinutes) || 0,
            paymentUrl:
              typeof placed.paymentUrl === "string" && placed.paymentUrl.startsWith("https://checkout.stripe.com/")
                ? placed.paymentUrl.slice(0, 2000)
                : undefined,
          }
        : undefined,
  };
}

export type Totals = { subtotalCents: number; taxCents: number; deliveryFeeCents: number; totalCents: number };

export function totals(s: OrderState): Totals {
  const subtotalCents = s.cart.reduce(
    (sum, l) => sum + (MENU_BY_ID.get(l.itemId)?.priceCents ?? 0) * l.quantity,
    0,
  );
  const deliveryFeeCents = s.fulfillment === "delivery" && subtotalCents > 0 ? RESTAURANT.deliveryFeeCents : 0;
  const taxCents = Math.round(subtotalCents * RESTAURANT.taxRate);
  return { subtotalCents, taxCents, deliveryFeeCents, totalCents: subtotalCents + taxCents + deliveryFeeCents };
}

export function describeLine(l: CartLine): string {
  const item = MENU_BY_ID.get(l.itemId);
  return `${l.quantity} × ${item?.name ?? l.itemId}${l.option ? ` (${l.option})` : ""}${l.notes ? ` — ${l.notes}` : ""}`;
}

/** Cheap, stable fingerprint of everything the customer must confirm. */
export function orderHash(s: OrderState): string {
  const key = JSON.stringify([
    s.cart.map((l) => [l.itemId, l.quantity, l.option ?? "", l.notes ?? ""]),
    s.fulfillment ?? "",
    s.deliveryAddress ?? "",
    s.customerName ?? "",
    s.customerPhone ?? "",
    s.payment ?? "",
  ]);
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function missingForCheckout(s: OrderState): string[] {
  const m: string[] = [];
  if (!s.cart.length) m.push("at least one item");
  if (!s.fulfillment) m.push("pickup or delivery");
  if (s.fulfillment === "delivery" && !s.deliveryAddress) m.push("delivery address");
  if (!s.customerName) m.push("customer name");
  if (!s.customerPhone || s.customerPhone.replace(/\D/g, "").length < 7) m.push("a valid phone number");
  if (!s.payment) m.push("how they'll pay (in person, or online by payment link)");
  return m;
}

export function summary(s: OrderState) {
  const t = totals(s);
  return {
    items: s.cart.map(describeLine),
    fulfillment: s.fulfillment ?? null,
    deliveryAddress: s.deliveryAddress ?? null,
    customerName: s.customerName ?? null,
    customerPhone: s.customerPhone ?? null,
    payment: s.payment ?? null,
    subtotal: t.subtotalCents / 100,
    tax: t.taxCents / 100,
    deliveryFee: t.deliveryFeeCents / 100,
    total: t.totalCents / 100,
    placed: s.placed ?? null,
  };
}

// ---- tool implementations -------------------------------------------------

type Result = { state: OrderState; result: unknown };

/** Fuzzy name → item lookup so the model can pass what the customer said. */
export function findItems(query: string) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  return MENU.filter((m) => {
    const hay = [m.name, m.id, ...(m.aliases ?? [])].join(" ").toLowerCase();
    return hay.includes(q) || (words.length > 0 && words.every((w) => hay.includes(w)));
  });
}

function mutate(state: OrderState, fn: (s: OrderState) => unknown): Result {
  if (state.placed) return { state, result: { error: "This order was already placed and can't be changed. Start a new order instead." } };
  const next: OrderState = { ...state, cart: state.cart.map((l) => ({ ...l })) };
  const result = fn(next);
  // Any change invalidates a previous read-back.
  next.readBackHash = undefined;
  return { state: next, result };
}

export function addItem(state: OrderState, args: { item: string; quantity?: number; option?: string; notes?: string }): Result {
  return mutate(state, (s) => {
    const matches = findItems(String(args.item ?? ""));
    if (matches.length === 0) return { error: `No menu item matches "${args.item}". Use search_menu to see options.` };
    if (matches.length > 1) return { error: "Ambiguous item — ask the customer which one.", candidates: matches.map((m) => m.name) };
    const item = matches[0];
    const quantity = Math.floor(Number(args.quantity ?? 1));
    if (!(quantity >= 1 && quantity <= MAX_LINE_QTY)) return { error: `Quantity must be between 1 and ${MAX_LINE_QTY}.` };
    let option = typeof args.option === "string" ? args.option.toLowerCase().trim() : undefined;
    if (item.options) {
      if (!option || !item.options.includes(option)) {
        return { error: `${item.name} needs one of these options: ${item.options.join(", ")}. Ask the customer.` };
      }
    } else option = undefined;
    const notes = typeof args.notes === "string" && args.notes.trim() ? args.notes.trim().slice(0, 140) : undefined;
    const existing = s.cart.find((l) => l.itemId === item.id && l.option === option && l.notes === notes);
    if (existing) existing.quantity = Math.min(MAX_LINE_QTY, existing.quantity + quantity);
    else if (s.cart.length >= MAX_LINES) return { error: "Too many different items in one order." };
    else s.cart.push({ itemId: item.id, quantity, option, notes });
    return { added: `${quantity} × ${item.name}`, order: summary(s) };
  });
}

export function removeItem(state: OrderState, args: { item: string; quantity?: number }): Result {
  return mutate(state, (s) => {
    const q = String(args.item ?? "").toLowerCase();
    const idx = s.cart.findIndex((l) => {
      const m = MENU_BY_ID.get(l.itemId)!;
      return [m.name, m.id, ...(m.aliases ?? [])].join(" ").toLowerCase().includes(q);
    });
    if (idx === -1) return { error: `"${args.item}" isn't in the order.` };
    const line = s.cart[idx];
    const qty = args.quantity ? Math.floor(Number(args.quantity)) : line.quantity;
    if (qty >= line.quantity) s.cart.splice(idx, 1);
    else line.quantity -= Math.max(1, qty);
    return { removed: args.item, order: summary(s) };
  });
}

export function setDetails(
  state: OrderState,
  args: { fulfillment?: string; delivery_address?: string; customer_name?: string; customer_phone?: string; payment?: string },
  opts: { onlinePayment: boolean } = { onlinePayment: false },
): Result {
  return mutate(state, (s) => {
    if (args.fulfillment !== undefined) {
      if (args.fulfillment !== "pickup" && args.fulfillment !== "delivery") return { error: "fulfillment must be pickup or delivery" };
      s.fulfillment = args.fulfillment;
      if (args.fulfillment === "pickup") s.deliveryAddress = undefined;
    }
    if (args.payment !== undefined) {
      if (args.payment !== "in_person" && args.payment !== "online") return { error: "payment must be in_person or online" };
      if (args.payment === "online" && !opts.onlinePayment) return { error: "Online payment isn't available right now; offer to pay in person." };
      s.payment = args.payment;
    }
    const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    s.deliveryAddress = clean(args.delivery_address, 200) ?? s.deliveryAddress;
    s.customerName = clean(args.customer_name, 60) ?? s.customerName;
    s.customerPhone = clean(args.customer_phone, 30) ?? s.customerPhone;
    if (s.fulfillment === "delivery") {
      const sub = totals(s).subtotalCents;
      if (sub > 0 && sub < RESTAURANT.deliveryMinimumCents) {
        return { note: `Delivery minimum is $${(RESTAURANT.deliveryMinimumCents / 100).toFixed(2)} before tax; the order is below it.`, order: summary(s) };
      }
    }
    return { order: summary(s) };
  });
}

/** Step 1 of checkout: validate and mark exactly this order as read back. */
export function reviewOrder(state: OrderState): Result {
  if (state.placed) return { state, result: { error: "Already placed.", order: summary(state) } };
  const missing = missingForCheckout(state);
  if (missing.length) return { state, result: { ready: false, missing } };
  if (state.fulfillment === "delivery" && totals(state).subtotalCents < RESTAURANT.deliveryMinimumCents) {
    return { state, result: { ready: false, missing: [`delivery minimum of $${(RESTAURANT.deliveryMinimumCents / 100).toFixed(2)} (or switch to pickup)`] } };
  }
  const status = openStatus();
  const next = { ...state, readBackHash: orderHash(state) };
  return {
    state: next,
    result: {
      ready: true,
      restaurant_open: status.open,
      ...(status.open ? {} : { warning: "The restaurant is closed right now; orders can't be placed." }),
      order: summary(state),
      payment:
        state.payment === "online"
          ? "Customer pays online: after the order is placed a secure payment link appears on their screen. Never take card numbers by voice."
          : "Customer pays in person (counter on pickup, or driver on delivery). Never take card numbers by voice.",
      instruction: "Read the full order, total, and name/phone back to the customer and ask for an explicit yes. Only call place_order after they say yes.",
    },
  };
}

export type PlacedOrder = {
  orderId: string;
  placedAt: string;
  paymentStatus: "pay_in_person" | "awaiting_online_payment";
  paymentUrl?: string;
  order: ReturnType<typeof summary>;
};

/**
 * Step 2 of checkout: only succeeds if the read-back matches the current order.
 * Pure: the caller performs the side effects (payment link, kitchen submit)
 * using `order`, and must discard the returned state if they fail.
 */
export function finalizeOrder(state: OrderState): Result & { order?: PlacedOrder } {
  if (state.placed) return { state, result: { error: "Already placed.", order: summary(state) } };
  const missing = missingForCheckout(state);
  if (missing.length) return { state, result: { error: "Order incomplete", missing } };
  if (!state.readBackHash || state.readBackHash !== orderHash(state)) {
    return { state, result: { error: "The customer hasn't confirmed this exact order. Call review_order, read it back, and get a yes first." } };
  }
  if (!openStatus().open) return { state, result: { error: "The restaurant is closed right now." } };
  if (state.fulfillment === "delivery" && totals(state).subtotalCents < RESTAURANT.deliveryMinimumCents) {
    return { state, result: { error: "Below the delivery minimum." } };
  }
  const t = totals(state);
  const orderId = `VM-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
  const eta = RESTAURANT.prepMinutes[state.fulfillment!];
  const next: OrderState = { ...state, placed: { orderId, totalCents: t.totalCents, etaMinutes: eta } };
  return {
    state: next,
    result: { success: true, orderId, total: t.totalCents / 100, ready_in_minutes: eta, fulfillment: state.fulfillment, payment: state.payment },
    order: {
      orderId,
      placedAt: new Date().toISOString(),
      paymentStatus: state.payment === "online" ? "awaiting_online_payment" : "pay_in_person",
      order: summary(next),
    },
  };
}
