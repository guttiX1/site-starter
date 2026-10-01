// Single source of truth for the Valley Meats voice agent: menu, hours,
// location and pricing rules. Replace the placeholder values below with the
// real restaurant data — nothing else in the agent hard-codes any of it.

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

export const RESTAURANT = {
  name: "Valley Meats",
  phone: "(555) 010-0199",
  address: "123 Valley Road, Springfield",
  taxRate: 0.0825,
  prepMinutes: { pickup: 20, delivery: 45 },
  deliveryFeeCents: 399,
  deliveryMinimumCents: 2000,
  deliveryRadiusMiles: 5,
  // 0 = Sunday … 6 = Saturday. Times are 24h "HH:MM" in `timezone`.
  timezone: "America/Chicago",
  hours: {
    0: { open: "12:00", close: "20:00" },
    1: null,
    2: { open: "11:00", close: "21:00" },
    3: { open: "11:00", close: "21:00" },
    4: { open: "11:00", close: "21:00" },
    5: { open: "11:00", close: "22:00" },
    6: { open: "11:00", close: "22:00" },
  } as Record<number, { open: string; close: string } | null>,
  notes: [
    "Closed Mondays.",
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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function hoursText(): string {
  return DAY_NAMES.map((d, i) => {
    const h = RESTAURANT.hours[i];
    return `${d}: ${h ? `${to12h(h.open)} – ${to12h(h.close)}` : "Closed"}`;
  }).join("\n");
}

/** Is the restaurant open at `now` (restaurant-local time)? */
export function openStatus(now = new Date()): { open: boolean; text: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT.timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayIdx = DAY_NAMES.indexOf(get("weekday"));
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const today = RESTAURANT.hours[dayIdx];
  if (today) {
    const [oh, om] = today.open.split(":").map(Number);
    const [ch, cm] = today.close.split(":").map(Number);
    if (minutes >= oh * 60 + om && minutes < ch * 60 + cm) {
      return { open: true, text: `Open now, until ${to12h(today.close)}.` };
    }
  }
  return { open: false, text: "Closed right now." };
}
