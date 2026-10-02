import { describe, expect, it } from "vitest";
import { MENU, MENU_BY_ID, RESTAURANT } from "@/lib/valley-meats/menu";
import { promoData } from "@/lib/valley-meats/promo-data";

// The promo video must only show facts that come from menu.ts and the real order math.
describe("promo video data", () => {
  const d = promoData();

  it("uses menu prices, not made-up numbers", () => {
    const taco = MENU_BY_ID.get("taco")!;
    expect(d.tacoPriceCents).toBe(taco.priceCents);
    expect(d.twoTacosCents).toBe(taco.priceCents * 2);
    expect(d.proteins).toEqual(taco.options!.slice(0, 5));
    expect(d.proteinCount).toBe(taco.options!.length);
    expect(d.itemCount).toBe(MENU.length);
    expect(d.pickupMin).toBe(RESTAURANT.prepMinutes.pickup);
  });

  it("sample order totals match the order logic (subtotal + tax)", () => {
    const taco = MENU_BY_ID.get("taco")!.priceCents;
    const guac = MENU_BY_ID.get("guacamole")!.priceCents;
    expect(d.sample.subtotalCents).toBe(taco * 2 + guac);
    expect(d.sample.totalCents).toBe(d.sample.subtotalCents + d.sample.taxCents);
  });

  it("every card has a known image and priced cards use menu prices", () => {
    for (const c of d.cards) {
      expect(["tacos", "asada", "bowl", "tray"]).toContain(c.img);
      if (c.priceCents != null) expect(MENU.some((m) => m.priceCents === c.priceCents)).toBe(true);
    }
  });
});
