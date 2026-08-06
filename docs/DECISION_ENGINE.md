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

### 3. MCP — the interface (bring your own agent)
The engine is an **MCP server**, not an app you have to use. Anyone points their
own agent/client at it and drives the same tools. You don't build the agent —
you build the thing every agent wants to call.
- `create_scenario(description, audience)` → scenario id
- `define_persona(scenario_id, profile)` → persona id (see influence graph below)
- `run_simulation(scenario_id, budget_tier)` → run id (kicks off MiroFish)
- `get_verdict(run_id)` → the `verdict.json` (includes who-moved-whom)
- `subscribe(scenario_id)` → live updates via SpacetimeDB

> Note: MiroFish *is already* a swarm (its OASIS agents). MCP is **not** a second
> swarm — it's orchestration. It decides *when and what* to simulate. Keeping
> those two roles separate is what stops this from becoming buzzword soup.

---

## The influence graph — model the shapers, not just the crowd

This is the feature that makes it worth more than a poll. Instead of a faceless
crowd, you define the **specific people who set opinion**, and the sim shows how
a reaction *cascades* from them outward.

A persona is a **profile**, not a faceless dot:

```
profile {
  role        : "tech journalist" | "crypto influencer" | "site editor" | ...
  lean        : political / ideological tilt (e.g. progressive, libertarian)
  platform    : where they post (X, a newsletter, a site)
  reach       : how many they influence  (sets contagion weight)
  tone        : skeptical / hype / measured
  interests   : the topics they actually care about
}
```

You arrange them in tiers, and MiroFish runs the contagion between tiers:

```
Tier 1  opinion-shapers   (journalists, editors, big accounts)  ── set the frame
Tier 2  amplifiers        (mid influencers, communities)        ── spread or kill it
Tier 3  the crowd         (everyone else)                       ── the outcome
```

Push a problem in at Tier 1, and the verdict tells you **who moved whom** — did
the tech-Democrat journalist pick it up, did crypto twitter amplify or bury it,
where did it stall. That cascade *is* the product.

### Responsible use — read this before naming real people
Building a profile from someone's **public role + public writing** ("a
tech-leaning-Democrat journalist archetype") is fair game and, honestly, *more
accurate* — you're modeling a type of reaction, not puppeteering a named human.

Impersonating a **specific, named real individual** — "simulate exactly what
`@RealJournalist` will say" — is where you invite defamation, publicity-rights,
and platform-ToS problems, and the output is less reliable anyway (you can't
verify it). **Default: archetype profiles seeded from public info. Named real
people: don't, or only with clear consent and heavy disclaimers.** This keeps
the tool powerful *and* keeps you out of court.

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
persona    { id, scenario_id, role, lean, platform, reach, tone, tier }  -- the shapers
persona_graph { scenario_id, graph_blob, model, cached_at }   -- the cache
run        { id, scenario_id, budget_tier, status, cost_estimate, started_at }
verdict    { run_id, outcome, confidence, summary, cascade_json, raw_json, finished_at }
subscriber { scenario_id, user }                              -- who's watching
```

`cascade_json` on the verdict is the who-moved-whom trace across the tiers.
Reducers: `submit_run`, `record_verdict`, `bump_status`, `add_persona`. Clients
subscribe to `run` + `verdict` for a scenario and get live progress for free.

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
- [x] Bring-your-own-agent (MCP server) + influence-graph persona model
- [ ] Stub the MCP tool surface (incl. `define_persona`)
- [ ] Stand up SpacetimeDB tables + reducers (incl. `persona` + `add_persona`)
- [ ] Wire MiroFish cheap-mode behind `run_simulation`
- [ ] Thin Next.js UI for the first user
