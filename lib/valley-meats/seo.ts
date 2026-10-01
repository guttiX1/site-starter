// SEO / AEO / agent-readiness helpers. Everything is generated from menu.ts so the
// page, the structured data, llms.txt, the markdown menu and the JSON API never disagree.

import { MENU, RESTAURANT, formatMoney, hoursText } from "./menu";

export const siteUrl = () => (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Visible FAQ — also emitted as FAQPage schema. Answers must stay visible on the page to be valid. */
export function faqs(): { q: string; a: string }[] {
  const veg = MENU.filter((m) => m.tags?.some((t) => t === "vegetarian" || t === "vegan")).map((m) => m.name);
  return [
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
}

export function restaurantJsonLd() {
  const base = siteUrl();
  const byCategory = [...new Set(MENU.map((m) => m.category))];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Restaurant",
        "@id": `${base}/valley-meats#restaurant`,
        name: RESTAURANT.name,
        url: `${base}/valley-meats`,
        telephone: RESTAURANT.phone,
        servesCuisine: RESTAURANT.cuisine,
        priceRange: RESTAURANT.priceRange,
        address: { "@type": "PostalAddress", ...RESTAURANT.addressParts },
        openingHoursSpecification: DAYS.flatMap((d, i) => {
          const h = RESTAURANT.hours[i];
          return h ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: d, opens: h.open, closes: h.close }] : [];
        }),
        hasMenu: { "@id": `${base}/valley-meats#menu` },
        acceptsReservations: false,
        potentialAction: { "@type": "OrderAction", target: { "@type": "EntryPoint", urlTemplate: `${base}/valley-meats`, actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"] }, deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"] },
      },
      {
        "@type": "Menu",
        "@id": `${base}/valley-meats#menu`,
        name: `${RESTAURANT.name} Menu`,
        inLanguage: "en-US",
        hasMenuSection: byCategory.map((c) => ({
          "@type": "MenuSection",
          name: c,
          hasMenuItem: MENU.filter((m) => m.category === c).map((m) => ({
            "@type": "MenuItem",
            name: m.name,
            description: m.description,
            offers: { "@type": "Offer", price: (m.priceCents / 100).toFixed(2), priceCurrency: "USD" },
            ...(m.tags?.some((t) => t === "vegetarian") ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
            ...(m.tags?.some((t) => t === "vegan") ? { suitableForDiet: "https://schema.org/VeganDiet" } : {}),
          })),
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs().map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json"> tag, safe against "</script>" injection. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export function menuMarkdown(): string {
  const base = siteUrl();
  const cats = [...new Set(MENU.map((m) => m.category))];
  return [
    `# ${RESTAURANT.name} — Menu`,
    "",
    `${RESTAURANT.cuisine} restaurant. ${RESTAURANT.address}. Phone ${RESTAURANT.phone}. Order online or by voice: ${base}/valley-meats`,
    "",
    "## Hours",
    "",
    ...hoursText().split("\n").map((l) => `- ${l}`),
    "",
    ...cats.flatMap((c) => [
      `## ${c}`,
      "",
      ...MENU.filter((m) => m.category === c).map(
        (m) => `- **${m.name}** — ${formatMoney(m.priceCents)}. ${m.description}${m.options ? ` Choose: ${m.options.join(", ")}.` : ""}${m.tags?.length ? ` (${m.tags.join(", ")})` : ""}`,
      ),
      "",
    ]),
    "## FAQ",
    "",
    ...faqs().flatMap((f) => [`**${f.q}** ${f.a}`, ""]),
  ].join("\n");
}
