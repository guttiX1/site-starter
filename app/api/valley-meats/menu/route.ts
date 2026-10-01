import { MENU, RESTAURANT, hoursText, openStatus } from "@/lib/valley-meats/menu";
import { rateLimited } from "@/lib/valley-meats/http";
import { siteUrl } from "@/lib/site-kit";
import { site } from "@/site.config";

export const runtime = "nodejs";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Public read-only data for agents and assistants. No customer data, no ordering. */
export function GET(req: Request) {
  if (rateLimited(req, "menu", 60)) return Response.json({ error: "Too many requests." }, { status: 429, headers: CORS });
  return Response.json(
    {
      restaurant: {
        name: RESTAURANT.name,
        cuisine: RESTAURANT.cuisine,
        address: RESTAURANT.address,
        phone: RESTAURANT.phone,
        url: `${siteUrl()}/valley-meats`,
        currency: "USD",
        timezone: RESTAURANT.timezone,
        delivery: { radiusMiles: RESTAURANT.deliveryRadiusMiles, feeCents: RESTAURANT.deliveryFeeCents, minimumCents: RESTAURANT.deliveryMinimumCents },
        prepMinutes: RESTAURANT.prepMinutes,
      },
      hours: hoursText().split("\n"),
      open: openStatus(),
      menu: MENU.map(({ id, name, category, priceCents, description, options, tags }) => ({ id, name, category, priceCents, description, options: options ?? [], tags: tags ?? [] })),
      faq: site.faqs,
    },
    { headers: { ...CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
