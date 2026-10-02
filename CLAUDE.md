# Valley Meats voice ordering — project notes

A Next.js 15 (App Router, React 19, TypeScript, Tailwind 4) site for a Mexican restaurant with a voice AI assistant that takes
orders, answers questions and checks out. The older "Scenario Engine" app (`/`, `/engine`) lives in the same repo; leave it alone.

## Commands
- `npm run dev` — local dev server (http://localhost:3000/valley-meats)
- `npm run verify` — typecheck + tests + secret scan + production build. **Run before every push.**
- `npm test` / `npm run typecheck` / `npm run scan:secrets` — the parts of verify

## Where things are
- `lib/valley-meats/menu.ts` — single source of truth for menu, hours, address, fees. **Currently placeholders**; real data must come from the owner.
- `lib/valley-meats/order.ts` — pure order logic (pricing, read-back gate, checkout). Prices are always recomputed from the menu; client state is untrusted.
- `lib/valley-meats/agent.ts` — AI loop. Providers: Claude (`ANTHROPIC_API_KEY`), Groq/OpenAI-compatible (`GROQ_API_KEY`), local Ollama (default).
- `lib/valley-meats/orders-out.ts` — delivers placed orders (SMS via Twilio, chat webhook, email, POS webhook) + optional customer text receipt.
- `lib/valley-meats/http.ts` — rate limits, daily budgets, cross-site check (Upstash Redis optional).
- `lib/site-kit/` + `site.config.ts` — SEO/AEO/agent-readiness generated from one config (see `docs/SITE_KIT.md`).
- `app/valley-meats/`, `app/privacy/`, `app/api/valley-meats/*` — UI and API routes.
- `docs/GO_LIVE.md` — launch checklist and current blockers. Keep it updated when status changes.

## Rules that must not be broken
1. **Never take card numbers by voice or chat.** Payment is in person or a hosted Stripe link.
2. **An order is placed only after the exact order was read back** (`readBackHash`); any change invalidates it; it can't be placed twice.
3. **Fail closed:** in production an order with no working delivery channel is refused, never silently logged. A customer text receipt never counts as delivery and never fails an order.
4. **Prices, hours and policies come from `menu.ts`**, never from the model or the client.
5. **No secrets in code, chat or logs.** Keys live in `.env.local` (git-ignored). Never edit `.env*` files except `.env.example`. If a key is pasted anywhere, tell the user to revoke it.
6. Don't invent business facts (address, hours, prices, allergens, reviews). Leave `[CONFIRM]` placeholders and say so.
7. Privacy page stays `noindex` with a DRAFT banner until `legal.reviewed` is true.
8. Add or update tests in `tests/` when changing `order.ts`, `orders-out.ts` or `http.ts`.

## Safety nets already in the repo
- `.claude/settings.json` hooks run `scripts/claude-guard.mjs`: blocks `git commit/push` when pending changes contain a secret, and blocks edits to real `.env` files.
- `.githooks/pre-commit` runs the same scan for humans (enabled by `npm install` via the `prepare` script).
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, secret scan and build on every push and pull request.

## Working style
- The owner is not a developer: give one step at a time, exact copy-paste commands, and never ask them to type secrets inside a command (use a prompt like `read -rs`).
- Verify claims by running things; say plainly what was only tested against mocks.
