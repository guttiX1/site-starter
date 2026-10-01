// Site Kit: SEO + AEO + agent-readiness generated from ONE config object (see /site.config.ts).
// Business-agnostic. A new site gets: robots.txt (search + AI crawlers), sitemap.xml, llms.txt,
// schema.org JSON-LD, a visible-FAQ-backed FAQPage, a markdown overview, page metadata and a JSON data object.

import type { Metadata, MetadataRoute } from "next";

export type Hours = Record<number, { open: string; close: string } | null>; // 0 = Sunday … 6 = Saturday, "HH:MM" 24h

export type CatalogItem = {
  name: string;
  category: string;
  description?: string;
  priceCents?: number;
  options?: string[];
  tags?: string[];
};

export type SiteConfig = {
  name: string;
  /** Short descriptor used in prose, e.g. "Mexican restaurant". */
  tagline: string;
  schemaType: "Restaurant" | "LocalBusiness" | "Organization";
  phone?: string;
  address?: {
    text: string;
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  hours?: Hours;
  timezone?: string;
  cuisine?: string;
  priceRange?: string;
  currency: string;
  /** The main page, e.g. "/valley-meats". */
  primaryPath: string;
  cta?: { text: string; path: string };
  /** Menu / product / service list. Becomes schema.org Menu (restaurants) and the markdown overview. */
  catalogName?: string;
  catalog?: CatalogItem[];
  /** Q&A shown VISIBLY on the page and emitted as FAQPage schema. Keep both in sync by rendering these. */
  faqs: { q: string; a: string }[];
  sitemap: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[];
  /** Paths crawlers should not fetch (APIs, private pages). */
  disallow?: string[];
  markdownPath?: string;
  /** Primary page <title> and meta description. */
  page: { title: string; description: string };
  llms: {
    summary: string;
    pages: { label: string; path: string; description: string }[];
    data?: { label: string; path: string; description: string }[];
    notes?: string[];
  };
  /** Order action for schema.org (restaurants that take online/voice orders). */
  orderAction?: boolean;
};

export const siteUrl = () =>
  (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

// ---- hours -----------------------------------------------------------------

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function hoursText(hours: Hours): string {
  return DAYS.map((d, i) => {
    const h = hours[i];
    return `${d}: ${h ? `${to12h(h.open)} – ${to12h(h.close)}` : "Closed"}`;
  }).join("\n");
}

/** Is the business open at `now` (business-local time)? */
export function openStatus(hours: Hours, timezone: string, now = new Date()): { open: boolean; text: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const today = hours[DAYS.indexOf(get("weekday"))];
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  if (today) {
    const [oh, om] = today.open.split(":").map(Number);
    const [ch, cm] = today.close.split(":").map(Number);
    if (minutes >= oh * 60 + om && minutes < ch * 60 + cm) return { open: true, text: `Open now, until ${to12h(today.close)}.` };
  }
  return { open: false, text: "Closed right now." };
}

// ---- crawler files ---------------------------------------------------------

// Search and AI crawlers are explicitly welcome on public pages.
export const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

export function robots(site: SiteConfig): MetadataRoute.Robots {
  const disallow = site.disallow ?? [];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}

export function sitemap(site: SiteConfig): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return site.sitemap.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}

/** llms.txt — plain-markdown map of the site for AI assistants (https://llmstxt.org). */
export function llmsTxt(site: SiteConfig): string {
  const base = siteUrl();
  const list = (xs: { label: string; path: string; description: string }[]) =>
    xs.map((x) => `- [${x.label}](${base}${x.path}): ${x.description}`).join("\n");
  return [
    `# ${site.name}`,
    "",
    `> ${site.llms.summary}`,
    "",
    "## Key pages",
    "",
    list(site.llms.pages),
    ...(site.llms.data?.length ? ["", "## Data for agents", "", list(site.llms.data)] : []),
    ...(site.llms.notes?.length ? ["", "## Notes", "", ...site.llms.notes.map((n) => `- ${n}`)] : []),
    "",
  ].join("\n");
}

// ---- structured data -------------------------------------------------------

export function jsonLd(site: SiteConfig) {
  const base = siteUrl();
  const page = `${base}${site.primaryPath}`;
  const cats = [...new Set((site.catalog ?? []).map((m) => m.category))];
  const isRestaurant = site.schemaType === "Restaurant";
  const catalog = site.catalog ?? [];
  const money = (c: number) => (c / 100).toFixed(2);

  const business = {
    "@type": site.schemaType,
    "@id": `${page}#restaurant`,
    name: site.name,
    url: page,
    ...(site.phone ? { telephone: site.phone } : {}),
    ...(isRestaurant && site.cuisine ? { servesCuisine: site.cuisine } : {}),
    ...(site.priceRange ? { priceRange: site.priceRange } : {}),
    ...(site.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: site.address.streetAddress,
            addressLocality: site.address.addressLocality,
            addressRegion: site.address.addressRegion,
            postalCode: site.address.postalCode,
            addressCountry: site.address.addressCountry,
          },
        }
      : {}),
    ...(site.hours
      ? {
          openingHoursSpecification: DAYS.flatMap((d, i) => {
            const h = site.hours![i];
            return h ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: d, opens: h.open, closes: h.close }] : [];
          }),
        }
      : {}),
    ...(isRestaurant && catalog.length ? { hasMenu: { "@id": `${page}#menu` } } : {}),
    ...(isRestaurant ? { acceptsReservations: false } : {}),
    ...(site.orderAction
      ? {
          potentialAction: {
            "@type": "OrderAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: page,
              actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"],
            },
            deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
          },
        }
      : {}),
  };

  const diet = (m: CatalogItem) => ({
    ...(m.tags?.includes("vegetarian") ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
    ...(m.tags?.includes("vegan") ? { suitableForDiet: "https://schema.org/VeganDiet" } : {}),
  });

  const menu =
    isRestaurant && catalog.length
      ? [
          {
            "@type": "Menu",
            "@id": `${page}#menu`,
            name: `${site.name} ${site.catalogName ?? "Menu"}`,
            inLanguage: "en-US",
            hasMenuSection: cats.map((c) => ({
              "@type": "MenuSection",
              name: c,
              hasMenuItem: catalog
                .filter((m) => m.category === c)
                .map((m) => ({
                  "@type": "MenuItem",
                  name: m.name,
                  ...(m.description ? { description: m.description } : {}),
                  ...(m.priceCents != null ? { offers: { "@type": "Offer", price: money(m.priceCents), priceCurrency: site.currency } } : {}),
                  ...diet(m),
                })),
            })),
          },
        ]
      : [];

  return {
    "@context": "https://schema.org",
    "@graph": [
      business,
      ...menu,
      {
        "@type": "FAQPage",
        mainEntity: site.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json"> tag, safe against "</script>" injection. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

// ---- page metadata ---------------------------------------------------------

export function pageMetadata(site: SiteConfig): Metadata {
  const { title, description } = site.page;
  return {
    title,
    description,
    alternates: {
      canonical: site.primaryPath,
      ...(site.markdownPath ? { types: { "text/markdown": site.markdownPath } } : {}),
    },
    openGraph: { title, description, url: site.primaryPath, siteName: site.name, type: "website", locale: "en_US" },
    twitter: { card: "summary", title, description },
  };
}

// ---- markdown + data for agents -------------------------------------------

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function markdown(site: SiteConfig): string {
  const base = siteUrl();
  const cats = [...new Set((site.catalog ?? []).map((m) => m.category))];
  const intro = [
    `${site.tagline}.`,
    site.address ? `${site.address.text}.` : "",
    site.phone ? `Phone ${site.phone}.` : "",
    site.cta ? `${site.cta.text}: ${base}${site.cta.path}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    `# ${site.name} — ${site.catalogName ?? "Overview"}`,
    "",
    intro,
    "",
    ...(site.hours ? ["## Hours", "", ...hoursText(site.hours).split("\n").map((l) => `- ${l}`), ""] : []),
    ...cats.flatMap((c) => [
      `## ${c}`,
      "",
      ...(site.catalog ?? [])
        .filter((m) => m.category === c)
        .map(
          (m) =>
            `- **${m.name}**${m.priceCents != null ? ` — ${money(m.priceCents)}.` : "."}${m.description ? ` ${m.description}` : ""}${m.options?.length ? ` Choose: ${m.options.join(", ")}.` : ""}${m.tags?.length ? ` (${m.tags.join(", ")})` : ""}`,
        ),
      "",
    ]),
    "## FAQ",
    "",
    ...site.faqs.flatMap((f) => [`**${f.q}** ${f.a}`, ""]),
  ].join("\n");
}

/** Generic read-only JSON for agents. Extend it per site if you need more fields. */
export function siteData(site: SiteConfig) {
  return {
    site: {
      name: site.name,
      description: site.tagline,
      url: `${siteUrl()}${site.primaryPath}`,
      phone: site.phone ?? null,
      address: site.address?.text ?? null,
      currency: site.currency,
      timezone: site.timezone ?? null,
    },
    hours: site.hours ? hoursText(site.hours).split("\n") : [],
    open: site.hours && site.timezone ? openStatus(site.hours, site.timezone) : null,
    catalog: (site.catalog ?? []).map((m) => ({ ...m, options: m.options ?? [], tags: m.tags ?? [] })),
    faq: site.faqs,
  };
}
