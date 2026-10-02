import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_ORDER,
  addItem,
  finalizeOrder,
  removeItem,
  reviewOrder,
  sanitizeState,
  setDetails,
  totals,
  type OrderState,
} from "@/lib/valley-meats/order";

const TUESDAY_NOON_DENVER = "2026-10-06T18:00:00Z"; // open
const TUESDAY_3AM_DENVER = "2026-10-06T09:00:00Z"; // closed

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TUESDAY_NOON_DENVER);
});
afterEach(() => vi.useRealTimers());

const err = (r: { result: unknown }) => (r.result as { error?: string }).error;

function readyOrder(): OrderState {
  let s = addItem(EMPTY_ORDER, { item: "taco", quantity: 2, option: "carne asada" }).state;
  s = setDetails(s, { fulfillment: "pickup", customer_name: "Sam", customer_phone: "555-123-4567", payment: "in_person" }).state;
  return s;
}

describe("adding and removing items", () => {
  it("requires a protein option for tacos", () => {
    const r = addItem(EMPTY_ORDER, { item: "taco", quantity: 1 });
    expect(err(r)).toMatch(/option/i);
    expect(r.state.cart).toHaveLength(0);
  });

  it("rejects an option that isn't on the menu", () => {
    expect(err(addItem(EMPTY_ORDER, { item: "taco", option: "lobster" }))).toBeTruthy();
  });

  it("asks which item when the name is ambiguous", () => {
    const r = addItem(EMPTY_ORDER, { item: "e" }); // matches many items
    expect(err(r)).toMatch(/ambiguous/i);
  });

  it("rejects unknown items and bad quantities", () => {
    expect(err(addItem(EMPTY_ORDER, { item: "sushi" }))).toBeTruthy();
    expect(err(addItem(EMPTY_ORDER, { item: "churros", quantity: 0 }))).toBeTruthy();
    expect(err(addItem(EMPTY_ORDER, { item: "churros", quantity: 999 }))).toBeTruthy();
  });

  it("merges identical lines and prices from the menu", () => {
    let s = addItem(EMPTY_ORDER, { item: "churros", quantity: 1 }).state;
    s = addItem(s, { item: "churros", quantity: 2 }).state;
    expect(s.cart).toHaveLength(1);
    expect(s.cart[0].quantity).toBe(3);
    expect(totals(s).subtotalCents).toBe(649 * 3);
  });

  it("removes items and reduces quantities", () => {
    let s = addItem(EMPTY_ORDER, { item: "churros", quantity: 3 }).state;
    s = removeItem(s, { item: "churros", quantity: 1 }).state;
    expect(s.cart[0].quantity).toBe(2);
    s = removeItem(s, { item: "churros" }).state;
    expect(s.cart).toHaveLength(0);
  });
});

describe("checkout safety", () => {
  it("cannot place an order that was never read back", () => {
    const r = finalizeOrder(readyOrder());
    expect(err(r)).toMatch(/confirm/i);
    expect(r.order).toBeUndefined();
  });

  it("places once after a read-back of the exact order", () => {
    const s = reviewOrder(readyOrder()).state;
    const r = finalizeOrder(s);
    expect(r.order?.orderId).toMatch(/^VM-/);
    expect(r.state.placed?.orderId).toBe(r.order?.orderId);
    expect(r.order?.paymentStatus).toBe("pay_in_person");
  });

  it("any change after the read-back invalidates it", () => {
    let s = reviewOrder(readyOrder()).state;
    s = addItem(s, { item: "churros" }).state;
    expect(finalizeOrder(s).order).toBeUndefined();
    s = reviewOrder(readyOrder()).state;
    s = setDetails(s, { customer_name: "Alex" }).state;
    expect(finalizeOrder(s).order).toBeUndefined();
  });

  it("cannot be placed twice, and a placed cart is frozen", () => {
    const placed = finalizeOrder(reviewOrder(readyOrder()).state).state;
    expect(err(finalizeOrder(placed))).toMatch(/already/i);
    expect(err(addItem(placed, { item: "churros" }))).toMatch(/already placed/i);
  });

  it("reports what is missing", () => {
    const r = reviewOrder(addItem(EMPTY_ORDER, { item: "churros" }).state);
    expect((r.result as { ready: boolean; missing: string[] }).ready).toBe(false);
    expect((r.result as { missing: string[] }).missing.join(" ")).toMatch(/name|phone|pickup|pay/i);
  });

  it("requires a payment choice and a plausible phone number", () => {
    let s = addItem(EMPTY_ORDER, { item: "churros" }).state;
    s = setDetails(s, { fulfillment: "pickup", customer_name: "Sam", customer_phone: "12" }).state;
    const missing = (reviewOrder(s).result as { missing: string[] }).missing.join(" ");
    expect(missing).toMatch(/phone/);
    expect(missing).toMatch(/pay/);
  });

  it("refuses online payment when it isn't enabled", () => {
    const r = setDetails(addItem(EMPTY_ORDER, { item: "churros" }).state, { payment: "online" }, { onlinePayment: false });
    expect(err(r)).toMatch(/online payment/i);
  });

  it("enforces the delivery minimum and fee", () => {
    let s = addItem(EMPTY_ORDER, { item: "churros", quantity: 1 }).state; // $6.49 < $20 minimum
    s = setDetails(s, { fulfillment: "delivery", delivery_address: "1 Main St", customer_name: "Sam", customer_phone: "555-123-4567", payment: "in_person" }).state;
    expect((reviewOrder(s).result as { ready: boolean }).ready).toBe(false);
    s = addItem(s, { item: "burrito", quantity: 1, option: "pollo" }).state; // + $11.99 => above minimum
    expect(totals(s).deliveryFeeCents).toBe(399);
  });

  it("refuses to place orders while the restaurant is closed", () => {
    const s = reviewOrder(readyOrder()).state;
    vi.setSystemTime(TUESDAY_3AM_DENVER);
    expect(err(finalizeOrder(s))).toMatch(/closed/i);
  });
});

describe("untrusted client state", () => {
  it("drops unknown items, caps quantities, strips bad options", () => {
    const s = sanitizeState({
      cart: [
        { itemId: "nope", quantity: 5 },
        { itemId: "churros", quantity: 9999, option: "bogus" },
        { itemId: "churros", quantity: -3 },
      ],
      fulfillment: "teleport",
    });
    expect(s.cart).toHaveLength(1);
    expect(s.cart[0].quantity).toBe(20);
    expect(s.cart[0].option).toBeUndefined();
    expect(s.fulfillment).toBeUndefined();
  });

  it("recomputes prices from the menu, never from the client", () => {
    const s = sanitizeState({ cart: [{ itemId: "churros", quantity: 1, priceCents: 1 }] });
    expect(totals(s).subtotalCents).toBe(649);
  });

  it("only keeps https Stripe payment links", () => {
    const placed = (url: string) => sanitizeState({ cart: [], placed: { orderId: "VM-1", totalCents: 1, etaMinutes: 1, paymentUrl: url } }).placed?.paymentUrl;
    expect(placed("https://checkout.stripe.com/c/pay/abc")).toBeTruthy();
    expect(placed("https://evil.example/pay")).toBeUndefined();
    expect(placed("javascript:alert(1)")).toBeUndefined();
  });

  it("handles garbage input", () => {
    expect(sanitizeState(null).cart).toEqual([]);
    expect(sanitizeState("x").cart).toEqual([]);
    expect(sanitizeState({ cart: "no" }).cart).toEqual([]);
  });
});
