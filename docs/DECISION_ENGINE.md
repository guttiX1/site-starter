# Scenario Engine — run the play before you commit

> One engine. Point it at a decision, and it simulates how the crowd, the
> market, the voters, or the holders react — *before* you actually do the thing.
> Cheap enough for anyone, not just people with a quant desk.

This is a working design doc, not a pitch. It names the pieces, how they fit,
and — most importantly — how it stays affordable.

---

## The one idea

Everything the users want is the **same primitive** with different inputs:

| User | What they point it at | The question |
|------|----------------------|--------------|
| Trader | a ticker / an event | "How does the crowd react if this drops?" |
| Campaign | a message / an ad | "How do voters respond before I spend the budget?" |
| Crypto | a token / a tweet | "Does this pump or panic the holders?" |
| Anyone | any decision | "Run it in a sandbox before I commit for real." |

Same machine. Different question. That's the product.

**What it is NOT:** a realtime, tick-by-tick oracle. It's a *scenario sandbox*:
you describe a situation, it simulates a crowd reacting, it hands back a verdict.
Runs take minutes, not milliseconds — and that's fine, because you run it
*before* you decide, not during.

---

## The three parts and why each earns its place

### 1. MiroFish — the simulation core (the "swarm")
Open-source engine (`666ghj/MiroFish`) built on OASIS/CAMEL-AI. It builds a
knowledge graph of a scenario, populates a digital world with LLM-driven
personas, lets them react to each other, and emits a machine-readable
`verdict.json` plus a report. **This is where the prediction happens.**
License: **AGPL-3.0** — see the license note below, it matters.

### 2. SpacetimeDB — the state + sharing layer (the advantage)
The reason this can be cheap and multiplayer:
- **Persistent worlds** — run an expensive sim once, store the result, serve it
  to many people. One sim → thousands of cheap reads.
- **Reactive subscriptions** — people watch a verdict update live without
  re-running anything.
- **Free tier + WASM reducers** — the *infrastructure* cost is near-zero; the
  only real cost is the LLM calls inside MiroFish.

### 3. MCP — the interface (so agents and apps can drive it)
A thin Model Context Protocol tool surface. Any agent, app, or the web UI calls
the same tools:
- `create_scenario(description, audience)` → scenario id
- `run_simulation(scenario_id, budget_tier)` → run id (kicks off MiroFish)
- `get_verdict(run_id)` → the `verdict.json`
- `subscribe(scenario_id)` → live updates via SpacetimeDB

> Note: MiroFish *is already* a swarm (its OASIS agents). MCP is **not** a second
> swarm — it's orchestration. It decides *when and what* to simulate. Keeping
> those two roles separate is what stops this from becoming buzzword soup.

---

## How the money stays small

The infrastructure is cheap; the LLM calls are the cost. So every lever here
targets the LLM bill — this is what turns a "$$$ hedge-fund toy" into a "$5 tool":

1. **Cheap model for the crowd, smart model for the summary.** 90% of calls are
   the persona swarm — run those on a small/cheap model. Use a frontier model
   only for the final synthesis. → ~10–50x cheaper.
2. **Cache the persona graph in SpacetimeDB.** Don't rebuild the world every run.
3. **Share results.** Same scenario asked by many people → one run, many reads.
4. **Fewer, smarter agents.** You don't need a million personas to get signal.
5. **Budget tiers.** `quick` (dozens of agents, cents) → `deep` (thousands,
   dollars). The user picks what they can afford.

---

## Data model sketch (SpacetimeDB tables)

```
scenario   { id, owner, description, audience, created_at }
persona_graph { scenario_id, graph_blob, model, cached_at }   -- the cache
run        { id, scenario_id, budget_tier, status, cost_estimate, started_at }
verdict    { run_id, outcome, confidence, summary, raw_json, finished_at }
subscriber { scenario_id, user }                              -- who's watching
```

Reducers: `submit_run`, `record_verdict`, `bump_status`. Clients subscribe to
`run` + `verdict` for a scenario and get live progress for free.

---

## First milestone (thin end-to-end slice)

Don't build all four layers at once. Prove the loop with the cheapest possible
version:

1. A Next.js page: type a scenario + pick a `quick` budget → submit.
2. MCP `run_simulation` shells out to MiroFish in cheap-mode on a tiny agent count.
3. Write the `verdict.json` into SpacetimeDB.
4. The page subscribes and shows the verdict when it lands.

If that loop works for **one** user (say: "how will crypto twitter react to this
tweet?"), everything else is turning the same crank harder.

---

## The one thing to decide with open eyes: the license

MiroFish is **AGPL-3.0**. If you run a *hosted* service built on it, the network
clause can require you to open-source your entire derivative to anyone who uses
it over the network.

- **Fine** if this is open / community / research — lean into it.
- **A real constraint** if you want a closed commercial product. Options: keep
  your code AGPL and monetize hosting/support, or wrap MiroFish as a separate
  process you call (talk to a lawyer before assuming that's clean).

Decide this early. It shapes the whole business, not just the code.

---

## Status

- [x] Named the primitive and the three layers
- [ ] Stub the MCP tool surface
- [ ] Stand up SpacetimeDB tables + reducers
- [ ] Wire MiroFish cheap-mode behind `run_simulation`
- [ ] Thin Next.js UI for the first user
