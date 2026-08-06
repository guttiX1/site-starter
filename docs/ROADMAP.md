# Build roadmap

Planning is done. This is the order to build in — each milestone is a thing you
can actually see working before starting the next. Don't build all layers at
once; prove the loop cheap, then deepen it.

## What you need before writing build code
These gate the first real step — they need you, not me:
1. **An LLM API key** (any OpenAI-format endpoint; a cheap model is fine to start).
2. **A host for the Python worker** — Fly.io / Railway / a small VM / your own box.
   (Vercel serverless can't run a multi-minute sim; that's why the worker is separate.)
3. **MiroFish cloned in** (`666ghj/MiroFish`) — and a nod to its **AGPL-3.0**
   terms (see the license note in the design doc).

## M0 — Fake end-to-end (no MiroFish, no LLM) · ~½ day
Prove the plumbing with a stub worker that emits scripted frames.
- `spacetime build && publish`; generate TS bindings.
- Next.js page: create a scenario, hit Run → `submit_run`.
- Stub worker (Node or Python) claims the run and writes fake `frame`s + a
  `verdict` on a timer.
- Wire the mockup canvas to real subscriptions instead of scripted data.
- ✅ You watch a real (fake-data) cascade animate from the DB. The whole spine works.

## M1 — Real sim, cheap, post-hoc frames · ~2–3 days
Swap the stub for MiroFish in cheap mode.
- Worker runs MiroFish `quick` tier (dozens of agents, small model).
- Use **frame strategy C**: let it finish, parse its log, reconstruct `frame`s.
- Cache the persona graph; enforce the hard cost cap.
- ✅ One real prediction for one scenario, for cents.

## M2 — MCP server · ~1–2 days
Expose the tool contracts so any agent can drive it.
- Implement the tools in `docs/MCP_TOOLS.md` over the reducers/subscriptions.
- ✅ "Bring your own agent" works — an external agent runs a sim and reads the verdict.

## M3 — Live frames + zoom · ~3–5 days
Make it feel real-time and drillable.
- Frame strategy A: hook OASIS's round loop to stream frames live.
- Individual-level traces + semantic zoom on the canvas.
- ✅ The scrubber updates as the sim runs; zoom into a community's individuals.

## M4 — Multi-user & sharing · ongoing
Turn it into a product.
- Row-level access rules in the module (drop blanket `public`).
- Shared/read-only scenario views; result sharing (one run → many viewers).
- Budget tiers in the UI with the up-front estimate.
- ✅ Other people can use it — the whole point.

## Sequencing note
M0 de-risks everything: if the DB spine and the canvas don't talk cleanly, that's
far cheaper to find with fake data than after wiring in a paid, slow LLM sim.
