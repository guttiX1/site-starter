// Single source of truth for the Valley Meats voice agent: menu, hours,
// location and pricing rules. Replace the placeholder values below with the
// real restaurant data — nothing else in the agent hard-codes any of it.

import { hoursText as kitHoursText, openStatus as kitOpenStatus } from "../site-kit";

export type MenuItem = {
  id: string;
  name: string;
  category: "Tacos & Burritos" | "Plates" | "Sides" | "Drinks" | "Desserts";
  priceCents: number;
  description: string;
  /** If present, the customer must pick one (e.g. protein). */
  options?: string[];
  /** Words a customer might say instead of the official name. */
  aliases?: string[];
  tags?: string[]; // e.g. "gluten-free", "vegetarian"
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
  // Owner: 9 AM–9 PM in summer, 9 AM–8 PM fall/winter. [CONFIRM] which months count as summer, and spring hours.
  timezone: "America/Denver",
  hours: daily("09:00", "20:00"),
  summerHours: daily("09:00", "21:00"),
  summerMonths: [6, 7, 8], // 1 = January … 12 = December
  summerLabel: "June–August",
  notes: [
    "Parking is free behind the building.",
    "Vegetarian options available: choose veggie (grilled peppers, onions, beans) as the protein.",
    "Allergens: kitchen handles gluten, dairy, nuts and shellfish — we cannot guarantee allergen-free preparation.",
  ],
};

const PROTEINS = ["carne asada", "al pastor", "carnitas", "pollo", "veggie"];

export const MENU: MenuItem[] = [
  { id: "taco", name: "Street Taco", category: "Tacos & Burritos", priceCents: 375, description: "Corn tortilla, onion, cilantro, salsa verde. Priced per taco.", options: PROTEINS, aliases: ["tacos", "street tacos"], tags: ["gluten-free"] },
  { id: "burrito", name: "Burrito", category: "Tacos & Burritos", priceCents: 1199, description: "Large flour tortilla with rice, beans, cheese, pico de gallo and your protein.", options: PROTEINS, aliases: ["burritos"] },
  { id: "quesadilla", name: "Quesadilla", category: "Tacos & Burritos", priceCents: 1099, description: "Grilled flour tortilla with melted Oaxaca cheese and your protein.", options: PROTEINS, aliases: ["quesadillas"], tags: ["vegetarian-with-veggie"] },
  { id: "torta", name: "Torta", category: "Tacos & Burritos", priceCents: 1249, description: "Toasted telera roll with beans, avocado, lettuce, tomato and your protein.", options: PROTEINS, aliases: ["tortas"] },
  { id: "enchiladas", name: "Enchilada Plate", category: "Plates", priceCents: 1449, description: "Three corn tortillas rolled with your protein, smothered in red or green sauce, with rice and beans.", options: PROTEINS, aliases: ["enchiladas"] },
  { id: "carne-asada-plate", name: "Carne Asada Plate", category: "Plates", priceCents: 1899, description: "Grilled marinated skirt steak with rice, beans, grilled onions and tortillas.", aliases: ["carne asada plate", "steak plate"], tags: ["gluten-free-without-tortillas"] },
  { id: "nachos", name: "Loaded Nachos", category: "Plates", priceCents: 1299, description: "Chips with queso, beans, pico de gallo, sour cream, jalapeños and your protein.", options: PROTEINS },
  { id: "chips-salsa", name: "Chips & Salsa", category: "Sides", priceCents: 399, description: "Fresh fried tortilla chips with house salsa roja.", aliases: ["chips and salsa"], tags: ["vegan", "gluten-free"] },
  { id: "guac", name: "Guacamole", category: "Sides", priceCents: 599, description: "Fresh smashed avocado with lime, onion and cilantro.", aliases: ["guacamole"], tags: ["vegan", "gluten-free"] },
  { id: "rice-beans", name: "Rice & Beans", category: "Sides", priceCents: 449, description: "Mexican rice and refried or black beans.", aliases: ["rice and beans"], options: ["refried", "black"], tags: ["vegetarian"] },
  { id: "elote", name: "Elote", category: "Sides", priceCents: 549, description: "Grilled street corn with mayo, cotija, chile and lime.", aliases: ["street corn"], tags: ["vegetarian", "gluten-free"] },
  { id: "horchata", name: "Horchata", category: "Drinks", priceCents: 349, description: "Cinnamon rice milk, served cold.", tags: ["vegetarian", "contains-dairy"] },
  { id: "agua-fresca", name: "Agua Fresca", category: "Drinks", priceCents: 349, description: "Fresh fruit water.", options: ["jamaica", "tamarindo", "pineapple"], aliases: ["agua"], tags: ["vegan", "gluten-free"] },
  { id: "jarritos", name: "Jarritos", category: "Drinks", priceCents: 299, description: "Mexican fruit soda.", options: ["lime", "mandarin", "tamarind", "pineapple"], tags: ["vegan"] },
  { id: "mexican-coke", name: "Mexican Coke", category: "Drinks", priceCents: 349, description: "Glass-bottle cane sugar cola.", aliases: ["coke", "coca cola"], tags: ["vegan"] },
  { id: "churros", name: "Churros", category: "Desserts", priceCents: 649, description: "Cinnamon sugar churros with chocolate dipping sauce.", tags: ["vegetarian"] },
  { id: "flan", name: "Flan", category: "Desserts", priceCents: 599, description: "Classic caramel custard.", tags: ["vegetarian", "gluten-free", "contains-dairy"] },
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
