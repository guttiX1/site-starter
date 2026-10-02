# Valley Meats — Go-Live Checklist

Adapted from the public "go-live" pre-launch skill idea (showstoppers must pass; polish can follow),
rewritten for a voice-ordering restaurant site. Status below was checked against this branch on 2026-10-01.

**Legend:** PASS verified · FAIL blocks launch · PARTIAL some verified · TODO needs a human/real accounts

## Verdict: NO-GO — remaining blockers: #1 real business info (yours), #3/#7 need your accounts and a real test, #8 owner/lawyer sign-off

## Showstoppers

| # | Check | Status | Evidence / what to do |
|---|---|---|---|
| 1 | Real business info (name, address, phone, hours, tax rate, menu, prices, allergen tags) | **FAIL** | `lib/valley-meats/menu.ts` is all placeholder (`123 Valley Road`, `(555) 010-0199`, tax 8.25%, invented menu). Also feeds the SEO schema, so wrong data would be published. Replace, then have the owner proof-read allergen tags. |
| 2 | Core flow works end to end | **PARTIAL** | Verified with a scripted AI stand-in: add item → details → read-back → place; order cannot be placed without read-back; edits invalidate the read-back; double-placing is blocked; closed hours refuse orders. **Not yet verified** with a real model (Claude/Groq/Ollama), real microphone, or real ElevenLabs. Run the manual test script below. |
| 3 | Orders actually reach the kitchen | **PARTIAL (built, needs your channel)** | Orders now go to any of: SMS to the kitchen/owner phone (Twilio), Slack/Discord webhook (readable ticket), email via Resend (optional), and/or a JSON webhook to your POS. A customer text receipt (`CUSTOMER_SMS=1`) is separate: best-effort, never blocks or fails an order, never counts as a delivery channel, capped by `DAILY_SMS_LIMIT`. Counts as delivered if at least one succeeds. **In production with no channel configured, orders are refused** (the agent tells the customer to call) instead of silently going to a log. Tested with mock endpoints: refuses with no channel or only failing channels; places with one working channel. **Not tested against real Slack/Discord/Resend.** You must set at least one channel (see `.env.example`) and run a real test order. Orders are still not stored in a database. |
| 4 | Payments | **PASS (pay-in-person only)** | Card numbers are never taken by voice. In-person payment needs no payment code. Online payment via Stripe is **untested** and has no webhook, so paid status can't be confirmed: leave `STRIPE_SECRET_KEY` unset at launch, or add the `checkout.session.completed` webhook first. |
| 5 | No secrets in code | **PASS** | Scanned working tree and full git history for key patterns: none. `.env*` is git-ignored; only `.env.example` is tracked. **Action for you:** revoke the Groq keys that were pasted into chat (console.groq.com/keys). |
| 6 | HTTPS | **TODO** | Not deployed yet. Microphone only works over HTTPS off localhost. HSTS header added. |
| 7 | Abuse / cost protection | **PARTIAL (built, needs your accounts)** | Added: cross-site POST blocking, per-client rate limits on every API, **max 3 orders/hour per client**, global daily caps on paid calls (`DAILY_AI_CALL_LIMIT`=2000, `DAILY_VOICE_CALL_LIMIT`=3000; callers get "please call us"), and optional shared limits via Upstash Redis (`UPSTASH_REDIS_REST_URL/TOKEN`). Tested: 429s after 60 requests/min, cross-site 403, daily cap 503, 4th order refused. **Still on you:** set hard spend limits in the Anthropic/Groq/OpenAI/ElevenLabs dashboards, and use Upstash (without it limits are per server instance). Bots can still call the endpoints within these caps; add Vercel Firewall/bot protection if abused. |
| 8 | Privacy & legal | **PARTIAL (draft written)** | `/privacy` is drafted from the real data flows and adapts to which services are enabled (AI provider, premium voice, Stripe). It shows a DRAFT banner and is `noindex` until `RESTAURANT.legal.reviewed` is set to `true` in `menu.ts`. Owner must fill every `[CONFIRM]` (legal name, contact email, retention period, sharing, rights) and have it reviewed by a qualified professional (not legal advice). An AI-disclosure + privacy link now sits under the voice controls and in the page footer. |
| 9 | Dependencies | **PASS w/ note** | Upgraded Next 15.5.2 → 15.5.27: removed the critical advisory. 2 advisories remain (1 high, 1 moderate): postcss bundled inside Next, build-time only; fix needs Next 16 (breaking). Re-run `npm audit` before launch. |

## User experience

| Check | Status | Notes |
|---|---|---|
| Works on a real phone (iPhone Safari + Android Chrome) | TODO | Layout is responsive; mic/voice behavior must be tested on devices. Firefox has no built-in speech recognition (falls back to typing). |
| 404 page | **PASS** | `app/not-found.tsx` |
| Error page (no stack traces) | **PASS** | `app/error.tsx` shows phone number fallback |
| Mic blocked / unsupported fallback | **PASS** | Clear message + text box |
| Loading speed | **PASS (build size)** | ~107 kB first-load JS on `/valley-meats`. Measure on pagespeed.web.dev after deploy. |
| Voice replies sound acceptable | TODO | Browser voice is robotic; ElevenLabs is better (needs key) |
| Accessibility | PARTIAL | Labels/aria and keyboard-focusable controls present; no full audit done |

## Operations

| Check | Status |
|---|---|
| Error tracking (Sentry or similar) | TODO — none installed |
| Analytics | TODO — none installed |
| Uptime alert | TODO |
| Backups | N/A today (no database) — becomes required once orders are stored (#3) |
| Security headers | **PASS** — nosniff, frame deny, referrer policy, permissions policy (mic self only), HSTS |
| Customer details kept out of logs | **PASS** — with a webhook set, logs hold only order id + payment status |

## Professional polish

| Check | Status |
|---|---|
| Custom domain + `SITE_URL` set at build time | TODO |
| Title / description / Open Graph tags | **PASS**; no share image yet (TODO) |
| Favicon | **FAIL (polish)** — still the Next.js template icon |
| SEO/AEO/agent files (robots, sitemap, llms.txt, JSON-LD, FAQ) | **PASS** — see `docs/SITE_KIT.md` (real details needed, #1) |
| Privacy linked in footer | **PASS** (draft); Terms of service: TODO |

## Industry-specific (food)

- Allergen statement is shown, but the per-item tags are invented — owner must verify (#1).
- Card data never touches this site (voice never takes card numbers; Stripe page is hosted by Stripe).
- Check local rules for online food ordering, delivery and sales tax with your accountant.

## Text messages (Twilio) — extra launch items

- **Sender registration:** in the US, texting from a regular Twilio number generally requires carrier registration (A2P 10DLC), and toll-free numbers require verification. This can take days, so start early and check Twilio's current rules. Unregistered messages may be blocked.
- **Consent wording:** the site tells customers a confirmation text will be sent, and the privacy page has a [CONFIRM] SMS section. Have a qualified professional review it (TCPA/state rules).
- **Cost + abuse:** every customer text costs money and goes to a number a stranger typed. Mitigations in code: only after a placed order, max 3 orders/hour per client, `DAILY_SMS_LIMIT`. Also set a Twilio usage cap.
- **Real test:** send yourself a real order and confirm both texts arrive. Verified so far only against a mock Twilio.

## Manual test script (do this with real keys before launch)

1. Order by voice: "two carne asada tacos and a horchata" → both appear with correct prices.
2. Ask: hours, address, delivery fee, "is anything vegetarian?" → answers match `menu.ts`.
3. Change your mind: "remove the horchata", "make it three tacos".
4. Say something unrelated ("write me a poem") → politely declined.
5. Checkout: pickup, name, phone → read-back is correct → say "no" → nothing is placed → fix → say "yes" → order placed once.
6. Try delivery below the minimum → refused or switched to pickup.
7. Try at a closed hour → refused.
8. Deny the microphone → clear message; typing still works.
9. Confirm the order arrives where the kitchen will see it (#3).
10. Repeat on iPhone Safari, Android Chrome and desktop Chrome.

## Fix order

1. #1 real business data → 2. #3 order delivery to the kitchen → 3. #7 spend caps + rate limiting →
4. #8 privacy page → 5. run the manual test script → 6. deploy, set `SITE_URL`, re-test on the live HTTPS URL.
