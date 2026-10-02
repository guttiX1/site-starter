// Everything the promo video shows comes from menu.ts and the real order logic, so re-rendering after the
// menu changes keeps the video accurate. No invented stats, reviews or rankings.

import { MENU, MENU_BY_ID, RESTAURANT } from "./menu";
import { EMPTY_ORDER, addItem, totals } from "./order";

export type PromoCard = { img: "tacos" | "asada" | "bowl" | "tray"; title: string; priceCents: number | null };

export type PromoData = {
  name: string;
  tacoName: string;
  tacoPriceCents: number;
  twoTacosCents: number;
  proteins: string[];
  proteinCount: number;
  categories: string[];
  itemCount: number;
  pickupMin: number;
  deliveryMin: number;
  cards: PromoCard[];
  sample: { utterance: string; reply: string; subtotalCents: number; taxCents: number; totalCents: number };
};

export function promoData(): PromoData {
  const taco = MENU_BY_ID.get("taco");
  const plate = MENU_BY_ID.get("platillo");
  if (!taco || !plate) throw new Error("promo needs the 'taco' and 'platillo' menu items");

  // The sample order goes through the same code the voice agent uses, so the totals are what a customer would pay.
  let s = addItem(EMPTY_ORDER, { item: "taco", quantity: 2, option: "asada" }).state;
  s = addItem(s, { item: "guacamole", quantity: 1 }).state;
  if (s.cart.length !== 2) throw new Error("promo sample order could not be built from the menu");
  const t = totals(s);

  return {
    name: RESTAURANT.name,
    tacoName: taco.name,
    tacoPriceCents: taco.priceCents,
    twoTacosCents: taco.priceCents * 2,
    proteins: (taco.options ?? []).slice(0, 5), // the video has room for five
    proteinCount: taco.options?.length ?? 0,
    categories: [...new Set(MENU.map((m) => m.category.toLowerCase().replace(" & ", " & ")))],
    itemCount: MENU.length,
    pickupMin: RESTAURANT.prepMinutes.pickup,
    deliveryMin: RESTAURANT.prepMinutes.delivery,
    cards: [
      { img: "tacos", title: taco.name, priceCents: taco.priceCents },
      { img: "asada", title: plate.name, priceCents: plate.priceCents },
      { img: "bowl", title: `${MENU.length} items on the menu`, priceCents: null },
      { img: "tray", title: RESTAURANT.name.toLowerCase() + ".", priceCents: null },
    ],
    sample: {
      utterance: "two asada tacos and a guacamole",
      reply: "Two asada tacos and a guacamole. Anything else?",
      subtotalCents: t.subtotalCents,
      taxCents: t.taxCents,
      totalCents: t.totalCents,
    },
  };
}
