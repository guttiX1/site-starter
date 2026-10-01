// Single source of truth for the Valley Meats voice agent: menu, hours,
// location and pricing rules. Replace the placeholder values below with the
// real restaurant data — nothing else in the agent hard-codes any of it.

export type MenuItem = {
  id: string;
  name: string;
  category: "Steaks" | "Burgers & Sandwiches" | "BBQ" | "Sides" | "Drinks" | "Desserts";
  priceCents: number;
  description: string;
  /** If present, the customer must pick one (e.g. doneness). */
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
    "Allergens: kitchen handles gluten, dairy, nuts and shellfish — we cannot guarantee allergen-free preparation.",
  ],
};

const DONENESS = ["rare", "medium rare", "medium", "medium well", "well done"];

export const MENU: MenuItem[] = [
  { id: "ribeye", name: "Ribeye Steak (12 oz)", category: "Steaks", priceCents: 2899, description: "Well-marbled 12 oz ribeye, grilled over oak.", options: DONENESS, aliases: ["rib eye"], tags: ["gluten-free"] },
  { id: "filet", name: "Filet Mignon (8 oz)", category: "Steaks", priceCents: 3499, description: "Tender 8 oz center-cut filet with garlic butter.", options: DONENESS, aliases: ["filet", "fillet"], tags: ["gluten-free"] },
  { id: "nystrip", name: "New York Strip (14 oz)", category: "Steaks", priceCents: 3099, description: "Bold, beefy 14 oz strip steak.", options: DONENESS, aliases: ["strip steak", "ny strip"], tags: ["gluten-free"] },
  { id: "valley-burger", name: "Valley Burger", category: "Burgers & Sandwiches", priceCents: 1399, description: "Half-pound beef patty, cheddar, pickles, house sauce, brioche bun.", options: ["medium", "well done"], aliases: ["house burger", "burger"] },
  { id: "bacon-burger", name: "Smokehouse Bacon Burger", category: "Burgers & Sandwiches", priceCents: 1599, description: "Valley Burger with thick-cut bacon and smoky BBQ sauce.", options: ["medium", "well done"] },
  { id: "brisket-sandwich", name: "Brisket Sandwich", category: "Burgers & Sandwiches", priceCents: 1499, description: "12-hour smoked brisket on a toasted bun with slaw.", aliases: ["brisket"] },
  { id: "ribs-half", name: "Half Rack of Ribs", category: "BBQ", priceCents: 1899, description: "Slow-smoked pork ribs, dry rub, with two sides worth of sauce.", aliases: ["half rack", "ribs"], tags: ["gluten-free"] },
  { id: "ribs-full", name: "Full Rack of Ribs", category: "BBQ", priceCents: 2999, description: "A full rack of slow-smoked pork ribs.", aliases: ["full rack"], tags: ["gluten-free"] },
  { id: "pulled-pork", name: "Pulled Pork Plate", category: "BBQ", priceCents: 1599, description: "Smoked pulled pork with cornbread.", aliases: ["pulled pork"] },
  { id: "fries", name: "Hand-Cut Fries", category: "Sides", priceCents: 499, description: "Skin-on fries with sea salt.", tags: ["vegetarian", "vegan"] },
  { id: "mac", name: "Mac & Cheese", category: "Sides", priceCents: 599, description: "Three-cheese baked macaroni.", aliases: ["mac and cheese"], tags: ["vegetarian"] },
  { id: "slaw", name: "Coleslaw", category: "Sides", priceCents: 399, description: "Crisp vinegar slaw.", tags: ["vegetarian", "gluten-free"] },
  { id: "beans", name: "Smoked Baked Beans", category: "Sides", priceCents: 449, description: "Slow-cooked beans with burnt ends.", tags: ["gluten-free"] },
  { id: "side-salad", name: "Garden Salad", category: "Sides", priceCents: 599, description: "Greens, tomato, cucumber, house vinaigrette.", tags: ["vegetarian", "vegan", "gluten-free"] },
  { id: "lemonade", name: "Fresh Lemonade", category: "Drinks", priceCents: 349, description: "House-squeezed lemonade.", tags: ["vegan", "gluten-free"] },
  { id: "iced-tea", name: "Iced Tea", category: "Drinks", priceCents: 299, description: "Fresh-brewed, sweet or unsweet.", options: ["sweet", "unsweet"], tags: ["vegan", "gluten-free"] },
  { id: "soda", name: "Fountain Soda", category: "Drinks", priceCents: 299, description: "Cola, lemon-lime or root beer.", options: ["cola", "lemon-lime", "root beer"], aliases: ["coke", "pop"], tags: ["vegan"] },
  { id: "pie", name: "Pecan Pie", category: "Desserts", priceCents: 799, description: "Warm pecan pie slice with whipped cream.", aliases: ["pecan pie"], tags: ["vegetarian", "contains-nuts"] },
  { id: "brownie", name: "Skillet Brownie", category: "Desserts", priceCents: 899, description: "Warm chocolate brownie with vanilla ice cream.", tags: ["vegetarian"] },
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
