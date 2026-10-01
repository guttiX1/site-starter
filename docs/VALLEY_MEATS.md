# Valley Meats voice agent

Try it: `cp .env.example .env.local`, fill in keys, `npm run dev`, open `/valley-meats`.

| Piece | Tech | File |
|---|---|---|
| Free voice (default, no key) | Browser Web Speech API for listening + speaking (Chrome/Edge/Safari; Chrome sends audio to Google for recognition) | `app/valley-meats/VoiceAgent.tsx` |
| Speech-to-text (premium) | OpenAI Whisper (menu vocabulary hint) | `app/api/valley-meats/transcribe/route.ts` |
| Free local AI | Ollama (`qwen3:8b` default) when no Anthropic key is set; weaker at tool calling than Claude, but order safety checks are enforced server-side | `lib/valley-meats/agent.ts` |
| Conversation + tool calling | Claude (`@anthropic-ai/sdk`, default `claude-opus-5-5`, `ANTHROPIC_MODEL` to override) | `lib/valley-meats/agent.ts` |
| Spoken replies | ElevenLabs TTS | `app/api/valley-meats/speak/route.ts` |
| Menu / hours / location | single data file — **placeholder values, replace them** | `lib/valley-meats/menu.ts` |
| Order rules | pure functions, prices recomputed server-side | `lib/valley-meats/order.ts` |
| Online payment (optional) | Stripe Checkout link when `STRIPE_SECRET_KEY` is set | `lib/valley-meats/stripe.ts` |
| UI | tap-to-talk (auto-stops on silence), text fallback | `app/valley-meats/VoiceAgent.tsx` |

Checkout safety: `place_order` only succeeds if the customer was read back the exact current order
(any edit invalidates it). Card numbers are never taken by voice — pay in person, or via the Stripe link.

Hooking into your existing waiter flow: completed orders are POSTed as JSON to `ORDER_WEBHOOK_URL`
(see `PlacedOrder` in `lib/valley-meats/order.ts`). For online payments the order is sent with
`paymentStatus: "awaiting_online_payment"`; add a Stripe webhook (`checkout.session.completed`,
`metadata.order_id`) in your system before the kitchen starts those.

Not production-ready as-is: in-memory rate limiting, no order persistence, no Stripe webhook handler.
