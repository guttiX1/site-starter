---
name: agent-ready-site
description: Make a website SEO-, AEO- and AI-agent-ready (robots incl. AI crawlers, sitemap, llms.txt, schema.org JSON-LD, visible FAQ, markdown + JSON data for agents). Use when building or auditing any site, landing page or business page, or when the user says SEO, AEO, GEO, llms.txt, structured data, "AI ready", or "agent ready".
---

# Agent-ready site

Every site ships with this by default. Don't wait to be asked.

## In a Next.js app that already has `lib/site-kit/`
Edit `site.config.ts` only. Read `docs/SITE_KIT.md` for the file map.

## In any other site (Next.js without the kit, static HTML, Astro, WordPress, …)
Produce, from one source of truth for the business facts:
1. `robots.txt` — allow `*` and the AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended); disallow only private/API paths; link the sitemap.
2. `sitemap.xml` with every public page.
3. `/llms.txt` (llmstxt.org format): `# Name`, `> one-line summary`, `## Key pages` as markdown links with descriptions, notes.
4. schema.org JSON-LD on the main page: `Restaurant`/`LocalBusiness`/`Organization` with `PostalAddress`, `openingHoursSpecification`, phone; `Menu`/`Offer` or `Service` for what is sold; `FAQPage`. Escape `<` as `<` in the inline script.
5. A **visible** FAQ whose text matches the FAQPage schema exactly.
6. Per-page `<title>`, meta description, canonical, Open Graph/Twitter tags.
7. A plain markdown version of key content (e.g. `/menu.md`) and, if useful, a public read-only JSON endpoint (no auth, no PII, CORS `*`, rate-limited). Never expose ordering/booking to anonymous agents without confirmation.
8. Semantic HTML (one `h1`, headings in order, descriptive link text, alt text, `lang`).

## Rules
- Never invent business facts (address, hours, prices, reviews). Use placeholders and say so loudly.
- Set the production URL at build time (e.g. `SITE_URL`) so canonical/sitemap/schema aren't `localhost`.
- Verify by fetching the real output (curl robots.txt, sitemap.xml, llms.txt; parse the JSON-LD). Don't claim rankings or AI citations.
- Remind the user of off-site steps: Google Business Profile, Search Console, Bing Webmaster Tools.
