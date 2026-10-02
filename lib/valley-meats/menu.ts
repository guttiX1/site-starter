// Single source of truth for the Valley Meats voice agent: menu, hours,
// location and pricing rules. Replace the placeholder values below with the
// real restaurant data — nothing else in the agent hard-codes any of it.

import { hoursText as kitHoursText, openStatus as kitOpenStatus } from "../site-kit";

export type MenuItem = {
  id: string;
  name: string;
  category: "Tacos" | "Burritos" | "Tortas" | "Quesadillas" | "Plates" | "Sides";
  priceCents: number;
  description: string;
  /** If present, the customer must pick one (e.g. protein). */
  options?: string[];
  /** Words a customer might say instead of the official name. */
  aliases?: string[];
  tags?: string[]; // dietary tags — only add ones the owner has confirmed
};

type Hours = Record<number, { open: string; close: string } | null>;

function daily(open: string, close: string): Hours {
  return Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open, close }]));
}

export const RESTAURANT = {
  name: "Valley Meats La Carniceria",
  phone: "(970) 704-9614",
  address: "774 State Route 133, Carbondale, CO 81623",
  // Name, phone and address confirmed by the owner / public listings. Anything marked [CONFIRM] is not.
  addressParts: { streetAddress: "774 State Route 133", addressLocality: "Carbondale", addressRegion: "CO", postalCode: "81623", addressCountry: "US" },
  // Legal/privacy details. PLACEHOLDERS — set `reviewed: true` only after the owner (and ideally a lawyer)
  // has checked the privacy page. While false the page shows a draft banner and is hidden from search engines.
  legal: {
    entityName: "Valley Meats La Carniceria",
    contactEmail: "[CONFIRM: owner's real email]",
    updated: "October 2, 2026",
    orderRetention: "12 months",
    reviewed: false,
  },
  cuisine: "Mexican",
  priceRange: "$$",
  // [CONFIRM] with the owner/accountant: public sources list ~10.15% for Carbondale, but it depends on county and district.
  taxRate: 0.1015,
  prepMinutes: { pickup: 20, delivery: 45 },
  deliveryFeeCents: 399,
  deliveryMinimumCents: 2000,
  deliveryRadiusMiles: 5,
  // 0 = Sunday … 6 = Saturday. Times are 24h "HH:MM" in `timezone`.
  // Owner: 9 AM–9 PM in summer, 9 AM–8 PM fall/winter. Summer = April–October (owner, 2026-10-02).
  timezone: "America/Denver",
  hours: daily("09:00", "20:00"),
  summerHours: daily("09:00", "21:00"),
  summerMonths: [4, 5, 6, 7, 8, 9, 10], // 1 = January … 12 = December
  summerLabel: "April–October",
  // [CONFIRM] Set true only after the owner gives real prices for every item in MENU.
  pricesConfirmed: false,
  notes: [
    "Tacos, burritos and quesadillas come with a choice of salsa naranja or salsa verde: ask which, and put it in the item notes.",
    "Tortas and platillos come with chile toreado or encurtido (pickled); platillos also need corn or flour tortillas: ask, and put it in the item notes.",
    "Allergens: [CONFIRM with owner] Please ask the restaurant about allergens before ordering.",
  ],
};

// Items, meats, included toppings and sides are from the owner's menu board (2026-10-02).
// PRICES ARE PLACEHOLDERS: the board shows no prices. Until `pricesConfirmed` is true, production refuses orders.
export const MEATS = ["asada", "barbacoa", "carnitas", "pollo", "suadero", "tripa", "lengua", "buche", "chicharrón", "al pastor", "chorizo", "fajitas"];

export const MENU: MenuItem[] = [
  { id: "taco", name: "Taco", category: "Tacos", priceCents: 375, description: "With cilantro, onion and lime. Choice of salsa naranja or salsa verde. Priced per taco.", options: MEATS, aliases: ["tacos"] },
  { id: "burrito", name: "Burrito", category: "Burritos", priceCents: 1199, description: "With cilantro, onion, avocado and refried pinto beans. Choice of salsa naranja or salsa verde.", options: MEATS, aliases: ["burritos"] },
  { id: "torta", name: "Torta", category: "Tortas", priceCents: 1249, description: "Regular torta with mayo, cilantro, onion, avocado and chile toreado or pickled jalapeño (encurtido).", options: MEATS, aliases: ["tortas", "torta regular"] },
  { id: "torta-especial", name: "Torta Especial", category: "Tortas", priceCents: 1399, description: "With mayo, lettuce, tomato, onion, avocado and chile toreado or pickled jalapeño (encurtido).", options: MEATS, aliases: ["tortas especiales", "special torta"] },
  { id: "quesadilla", name: "Quesadilla", category: "Quesadillas", priceCents: 1099, description: "Choice of salsa naranja or salsa verde, served on the side.", options: MEATS, aliases: ["quesadillas"] },
  { id: "platillo", name: "Platillo de Carne", category: "Plates", priceCents: 1699, description: "Your choice of meat with refried beans and cheese, lettuce, tomato, onion, chile toreado or encurtido, and corn or flour tortillas.", options: MEATS, aliases: ["platillo", "plate", "meat plate", "platillo de carne al gusto"] },
  { id: "guacamole", name: "Guacamole", category: "Sides", priceCents: 599, description: "Side of guacamole.", aliases: ["guac"] },
  { id: "frijoles", name: "Frijoles Refritos", category: "Sides", priceCents: 449, description: "Side of refried beans.", aliases: ["refried beans", "beans", "frijoles"] },
  { id: "crema", name: "Crema", category: "Sides", priceCents: 149, description: "Side of Mexican crema.", aliases: ["sour cream", "cream"] },
  { id: "pico", name: "Pico de Gallo", category: "Sides", priceCents: 299, description: "Side of pico de gallo.", aliases: ["pico"] },
  { id: "chile-toreado", name: "Chile Toreado o Encurtido", category: "Sides", priceCents: 199, description: "Side of blistered (toreado) or pickled (encurtido) chiles.", options: ["toreado", "encurtido"], aliases: ["chiles toreados", "jalapeños", "chile"] },
  { id: "cebollas", name: "Cebollas Asadas", category: "Sides", priceCents: 299, description: "Side of grilled onions.", aliases: ["grilled onions", "cebollitas"] },
];

export const MENU_BY_ID = new Map(MENU.map((m) => [m.id, m]));

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Hours in effect at `now`, switching to summer hours by restaurant-local month. */
export function currentHours(now = new Date()): Hours {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: RESTAURANT.timezone, month: "numeric" }).format(now));
  return RESTAURANT.summerMonths.includes(month) ? RESTAURANT.summerHours : RESTAURANT.hours;
}

function scheduleText(hours: Hours): string {
  const text = kitHoursText(hours);
  const times = new Set(text.split("\n").map((l) => l.split(": ")[1]));
  return times.size === 1 ? `Every day: ${[...times][0]}` : text;
}

export const hoursText = () =>
  `${scheduleText(RESTAURANT.hours)}\nSummer hours (${RESTAURANT.summerLabel}): ${scheduleText(RESTAURANT.summerHours).replace(/\n/g, "; ")}`;

/** Is the restaurant open at `now` (restaurant-local time)? */
export const openStatus = (now = new Date()) => kitOpenStatus(currentHours(now), RESTAURANT.timezone, now);
