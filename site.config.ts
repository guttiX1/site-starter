// ONE config per site. Everything SEO / AEO / agent-readiness is generated from this file by lib/site-kit.
// For a new site: copy lib/site-kit + the thin route files, then rewrite this file (see docs/SITE_KIT.md).

import { MENU, RESTAURANT, currentHours, formatMoney, hoursText } from "@/lib/valley-meats/menu";
import { siteUrl, type SiteConfig } from "@/lib/site-kit";

const veg = MENU.filter((m) => m.tags?.some((t) => t === "vegetarian" || t === "vegan")).map((m) => m.name);

const faqs = [
  { q: `What are ${RESTAURANT.name}'s hours?`, a: hoursText().replace(/\n/g, "; ") + "." },
  { q: `Where is ${RESTAURANT.name} located?`, a: `${RESTAURANT.address}. ${RESTAURANT.notes.find((n) => /parking/i.test(n)) ?? ""}`.trim() },
  {
    q: "Do you offer delivery?",
    a: `Yes, within ${RESTAURANT.deliveryRadiusMiles} miles. Delivery costs ${formatMoney(RESTAURANT.deliveryFeeCents)} with a ${formatMoney(RESTAURANT.deliveryMinimumCents)} minimum before tax, and usually takes about ${RESTAURANT.prepMinutes.delivery} minutes. Pickup is ready in about ${RESTAURANT.prepMinutes.pickup} minutes.`,
  },
  { q: "Do you have vegetarian or vegan options?", a: `Yes: ${veg.join(", ")}. Choose the veggie option for tacos, burritos, quesadillas, tortas, enchiladas and nachos.` },
  { q: "Can I order by voice?", a: `Yes. Use the voice assistant on this page to order, ask questions and check out by speaking, or call ${RESTAURANT.phone}.` },
  { q: "How can I pay?", a: "Pay in person at pickup or to the delivery driver, or pay online through a secure payment link when it is available." },
  { q: "Can you accommodate allergies?", a: RESTAURANT.notes.find((n) => /allergen/i.test(n)) ?? "Please ask us about allergens before ordering." },
];

const title = `${RESTAURANT.name} — ${RESTAURANT.cuisine} Restaurant | Order Online or by Voice`;

export const site: SiteConfig = {
  name: RESTAURANT.name,
  tagline: `${RESTAURANT.cuisine} restaurant`,
  schemaType: "Restaurant",
  phone: RESTAURANT.phone,
  address: { text: RESTAURANT.address, ...RESTAURANT.addressParts },
  hours: currentHours(), // season at build time; rebuild when the season changes
  timezone: RESTAURANT.timezone,
  cuisine: RESTAURANT.cuisine,
  priceRange: RESTAURANT.priceRange,
  currency: "USD",
  primaryPath: "/valley-meats",
  cta: { text: "Order online or by voice", path: "/valley-meats" },
  catalogName: "Menu",
  catalog: MENU,
  faqs,
  sitemap: [
    { path: "/", priority: 0.5, changeFrequency: "monthly" },
    { path: "/valley-meats", priority: 1, changeFrequency: "weekly" },
    { path: "/valley-meats/menu.md", priority: 0.6, changeFrequency: "weekly" },
    { path: "/engine", priority: 0.4, changeFrequency: "monthly" },
  ],
  disallow: ["/api/valley-meats/agent", "/api/valley-meats/speak", "/api/valley-meats/transcribe"],
  markdownPath: "/valley-meats/menu.md",
  page: {
    title,
    description: `${RESTAURANT.name}: ${RESTAURANT.cuisine} food at ${RESTAURANT.address}. See the menu, hours and delivery info, then order for pickup or delivery by voice or online.`,
  },
  llms: {
    summary: `${RESTAURANT.cuisine} restaurant at ${RESTAURANT.address}. Phone ${RESTAURANT.phone}. Pickup and delivery; customers can order and check out by voice.`,
    pages: [
      { label: "Order online or by voice", path: "/valley-meats", description: "the live menu, hours, FAQ and the voice ordering assistant" },
      { label: "Full menu in Markdown", path: "/valley-meats/menu.md", description: "every item, price, option, dietary tag, hours and FAQ in plain text" },
    ],
    data: [{ label: "Menu, hours and open-now status as JSON", path: "/api/valley-meats/menu", description: "read-only, no authentication, CORS-enabled" }],
    notes: [
      "Prices are in USD and exclude sales tax and delivery fees.",
      `Orders are placed through the voice assistant or website, or by phone at ${RESTAURANT.phone}. Agents should not place orders on a customer's behalf without their explicit confirmation.`,
    ],
  },
  orderAction: true,
};

export { siteUrl };
