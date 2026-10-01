# Site Kit — SEO + AEO + agent-ready by default

`lib/site-kit/index.ts` generates everything from one config object (`site.config.ts`).
It is business-agnostic (restaurant, local business, organization).

| Output | Where | Why |
|---|---|---|
| `robots.txt` | `app/robots.ts` | Welcomes Google and AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …); blocks only your private/API paths |
| `sitemap.xml` | `app/sitemap.ts` | Discovery |
| `llms.txt` | `app/llms.txt/route.ts` | Plain-markdown map of the site for AI assistants |
| Markdown overview | `app/<page>/menu.md/route.ts` | Clean text version of the catalog/FAQ for agents |
| schema.org JSON-LD | `jsonLd(site)` in the page | Restaurant/LocalBusiness, hours, address, Menu, FAQPage |
| Page metadata | `pageMetadata(site)` | Title, description, canonical, Open Graph, Twitter |
| JSON for agents | `siteData(site)` (generic) | Read-only facts: hours, open-now, catalog, FAQ |

## Start a new site

1. Copy `lib/site-kit/` and `site.config.ts` into the new Next.js app (or start from a repo that already has them).
2. Copy the thin route files: `app/robots.ts`, `app/sitemap.ts`, `app/llms.txt/route.ts`, the markdown route.
3. Rewrite `site.config.ts` with the real business: name, address parts, hours, FAQs, catalog, pages.
4. On the main page: `export const metadata = pageMetadata(site)`, render `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd(site)) }} />`, and **render `site.faqs` visibly** (schema must match visible text).
5. Set `SITE_URL=https://your-domain.com` **at build time** (canonical, sitemap and schema URLs are generated during the build).

## Launch checklist (the kit can't do these for you)

- Real address, phone, hours (wrong structured data hurts more than none).
- Claim Google Business Profile; submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- Keep hours/menu identical everywhere (site, Google profile, delivery apps).
- Add real photos with alt text and genuine reviews.
- Re-check after changes: view-source for the JSON-LD, validate at validator.schema.org and Google's Rich Results Test.

Nothing here guarantees rankings or AI citations; it makes the site readable and eligible.
