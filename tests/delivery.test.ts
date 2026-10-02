import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetExceeded, crossSite, rateLimited } from "@/lib/valley-meats/http";
import { deliverOrder, receiptText, ticketText, toE164 } from "@/lib/valley-meats/orders-out";
import type { PlacedOrder } from "@/lib/valley-meats/order";

const order = {
  orderId: "VM-TEST",
  placedAt: "2026-10-06T17:00:00.000Z",
  paymentStatus: "pay_in_person",
  order: { items: ["2 × Street Taco (carne asada)"], fulfillment: "pickup", deliveryAddress: null, customerName: "Sam", customerPhone: "555-123-4567", payment: "in_person", subtotal: 7.5, tax: 0.62, deliveryFee: 0, total: 8.12, placed: null },
} as unknown as PlacedOrder;

const CHANNEL_ENV = ["ORDER_WEBHOOK_URL", "ORDER_SLACK_WEBHOOK_URL", "RESEND_API_KEY", "ORDER_EMAIL_TO", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "ORDER_SMS_TO", "CUSTOMER_SMS", "ALLOW_LOG_ONLY_ORDERS", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
let calls: string[] = [];

beforeEach(() => {
  for (const k of CHANNEL_ENV) vi.stubEnv(k, "");
  calls = [];
  // Any URL containing "fail" returns 500; everything else succeeds.
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    return new Response("{}", { status: String(url).includes("fail") ? 500 : 200 });
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const smsEnv = (extra: Record<string, string> = {}) => {
  const env = { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+15550001111", TWILIO_API_BASE: "http://sms.test", ...extra };
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
};

describe("phone numbers", () => {
  it.each([
    ["555-123-4567", "+15551234567"],
    ["(555) 123 4567", "+15551234567"],
    ["1 555 123 4567", "+15551234567"],
    ["+44 7700 900123", "+447700900123"],
  ])("normalizes %s", (input, expected) => expect(toE164(input)).toBe(expected));
  it.each(["12345", "555 123", "+1", "abc", ""])("rejects %s", (input) => expect(toE164(input)).toBeNull());
});

describe("order delivery fails closed", () => {
  it("refuses in production when no channel is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(deliverOrder(order)).rejects.toThrow(/no order delivery channel/i);
  });

  it("allows log-only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(deliverOrder(order)).resolves.toBeUndefined();
  });

  it("succeeds if at least one channel works", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDER_WEBHOOK_URL", "http://pos.test/fail");
    vi.stubEnv("ORDER_SLACK_WEBHOOK_URL", "http://chat.test/ok");
    await expect(deliverOrder(order)).resolves.toBeUndefined();
  });

  it("refuses when every channel fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDER_WEBHOOK_URL", "http://pos.test/fail");
    await expect(deliverOrder(order)).rejects.toThrow(/all order delivery channels failed/i);
  });

  it("kitchen SMS counts as a delivery channel", async () => {
    vi.stubEnv("NODE_ENV", "production");
    smsEnv({ ORDER_SMS_TO: "+15559876543" });
    await expect(deliverOrder(order)).resolves.toBeUndefined();
    expect(calls.some((c) => c.includes("Messages.json"))).toBe(true);
  });

  it("a customer receipt alone does NOT count as delivery, and sends nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    smsEnv({ CUSTOMER_SMS: "1" });
    await expect(deliverOrder(order)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("a failing customer receipt never fails the order", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDER_SLACK_WEBHOOK_URL", "http://chat.test/ok");
    smsEnv({ CUSTOMER_SMS: "1", TWILIO_ACCOUNT_SID: "ACfail" });
    await expect(deliverOrder(order)).resolves.toBeUndefined();
  });

  it("sends the customer a receipt to the normalized number", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORDER_SLACK_WEBHOOK_URL", "http://chat.test/ok");
    smsEnv({ CUSTOMER_SMS: "1" });
    await deliverOrder(order);
    const sms = (fetch as unknown as { mock: { calls: [string, { body: URLSearchParams }][] } }).mock.calls.filter(([u]) => u.includes("Messages.json"));
    expect(sms).toHaveLength(1);
    expect(sms[0][1].body.get("To")).toBe("+15551234567");
  });
});

describe("message text", () => {
  it("kitchen ticket has what the kitchen needs", () => {
    const t = ticketText(order);
    for (const s of ["VM-TEST", "PICKUP", "PAY IN PERSON", "Sam", "555-123-4567", "Street Taco", "TOTAL $8.12"]) expect(t).toContain(s);
  });
  it("warns the kitchen not to start unpaid online orders", () => {
    expect(ticketText({ ...order, paymentStatus: "awaiting_online_payment" } as PlacedOrder)).toMatch(/do not start until paid/i);
  });
  it("customer receipt is short and has the order id and total", () => {
    const t = receiptText(order);
    expect(t).toContain("VM-TEST");
    expect(t).toContain("$8.12");
    expect(t.length).toBeLessThan(320);
  });
});

describe("abuse protection", () => {
  const req = (ip: string, headers: Record<string, string> = {}) => new Request("http://localhost/x", { method: "POST", headers: { "x-forwarded-for": ip, ...headers } });

  it("rate limits per client within the window", async () => {
    const r = req("9.9.9.9");
    expect([await rateLimited(r, "t1", 3), await rateLimited(r, "t1", 3), await rateLimited(r, "t1", 3), await rateLimited(r, "t1", 3)]).toEqual([false, false, false, true]);
    expect(await rateLimited(req("8.8.8.8"), "t1", 3)).toBe(false); // other client unaffected
  });

  it("enforces a global daily budget", async () => {
    expect([await budgetExceeded("t-budget", 2), await budgetExceeded("t-budget", 2), await budgetExceeded("t-budget", 2)]).toEqual([false, false, true]);
  });

  it("blocks cross-site browser requests, allows same-origin and non-browser", () => {
    expect(crossSite(req("1.1.1.1", { origin: "https://evil.example", host: "valleymeats.test" }))).toBe(true);
    expect(crossSite(req("1.1.1.1", { origin: "https://valleymeats.test", host: "valleymeats.test" }))).toBe(false);
    expect(crossSite(req("1.1.1.1"))).toBe(false);
  });
});
