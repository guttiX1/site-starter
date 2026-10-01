import { RESTAURANT } from "@/lib/valley-meats/menu";
import { siteUrl } from "@/lib/valley-meats/seo";

// llms.txt: a plain-markdown map of the site for AI assistants and agents (https://llmstxt.org).
export function GET() {
  const base = siteUrl();
  const body = `# ${RESTAURANT.name}

> ${RESTAURANT.cuisine} restaurant at ${RESTAURANT.address}. Phone ${RESTAURANT.phone}. Pickup and delivery; customers can order and check out by voice.

## Key pages

- [Order online or by voice](${base}/valley-meats): the live menu, hours, FAQ and the voice ordering assistant
- [Full menu in Markdown](${base}/valley-meats/menu.md): every item, price, option, dietary tag, hours and FAQ in plain text

## Data for agents

- [Menu, hours and open-now status as JSON](${base}/api/valley-meats/menu): read-only, no authentication, CORS-enabled

## Notes

- Prices are in USD and exclude sales tax and delivery fees.
- Orders are placed through the voice assistant or website, or by phone at ${RESTAURANT.phone}. Agents should not place orders on a customer's behalf without their explicit confirmation.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
