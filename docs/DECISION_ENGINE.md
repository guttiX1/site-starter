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

## The Canvas — the primary UI (glass box, not black box)

The graph is not decoration. It's **both how you build the sim and how you read
the result** — one canvas, two modes. This is the product's face.

### Semantic zoom: communities ↔ individuals
The canvas has levels of detail, like Obsidian / a map:

```
Zoomed OUT  →  community nodes   ("crypto twitter", "tech press", "suburban voters")
                these bubbles are the "regions"
Zoomed IN   →  the individual shapers inside a community
                (a specific tech-journalist archetype, a big account, an editor)
```

A **region = a community bubble**. Zooming into it reveals the individuals that
compose it; **replay** shows how those individuals aligned into it. That's
literally "see how the region was made."

### Mode 1 — Build (set up the world)
- Drag nodes onto the canvas. Zoom out to place communities, zoom in to add or
  edit individual shapers inside them.
- Click a node → **profile card** (role, lean, platform, reach, tone). This is
  how the user "decides the people/sites."
- Draw edges = influence/follows. Nodes auto-sort into tiers (shapers →
  amplifiers → crowd).

### Mode 2 — Replay (watch what happened)
- Push the problem in at the top; hit play.
- Nodes **light up** as they react, edges **pulse** as influence flows, and
  camps/regions visibly **crystallize**.
- A **timeline scrubber** rewinds the whole thing — see who moved first, which
  edge tipped a region, where it stalled.
- Click any node at any point in time → what it "said" and why it flipped.

### What this demands technically (so we plan for it now)
- **Semantic zoom / level-of-detail rendering** — render communities vs
  individuals depending on zoom. (Canvas/WebGL graph lib, not plain SVG, once
  node counts grow.)
- **Time-series of node states**, not just a final verdict — the replay needs
  every node's state at each simulated step. MiroFish must emit a *timeline*,
  and SpacetimeDB stores it (see `frame` below).
- **Stable node identities** across build → run → replay so the map you built is
  the map that animates.

---

## Data model sketch (SpacetimeDB tables)

```
scenario   { id, owner, description, audience, created_at }
community  { id, scenario_id, label, lean, size, tier }        -- zoomed-out "region"
persona    { id, scenario_id, community_id, role, lean, platform, reach, tone }  -- zoomed-in shaper
edge       { scenario_id, from_persona, to_persona, weight }   -- influence links
persona_graph { scenario_id, graph_blob, model, cached_at }    -- the cache
run        { id, scenario_id, budget_tier, status, cost_estimate, started_at }
frame      { run_id, step, node_id, state, said }              -- per-step replay timeline
verdict    { run_id, outcome, confidence, summary, cascade_json, raw_json, finished_at }
subscriber { scenario_id, user }                               -- who's watching
```

`frame` is what powers the scrubber — one row per node per simulated step, so
the canvas can replay the formation of each region. `cascade_json` on the
verdict is the summarized who-moved-whom. Reducers: `add_community`,
`add_persona`, `add_edge`, `submit_run`, `record_frames`, `record_verdict`,
`bump_status`. Clients subscribe to `frame` + `verdict` for a run and the canvas
animates live.

> **This is written as real code:** see [`spacetime/src/lib.rs`](../spacetime/src/lib.rs)
> for the tables + reducers (Rust, targets 2.6) and [`spacetime/README.md`](../spacetime/README.md)
> for build/publish and the exact subscription queries.

---

## The run pipeline — where a simulation actually executes

A run is **not** a request/response. It takes minutes and costs money, so it's an
**async job** with live progress. The elegant part: the web app and the heavy
Python worker **never call each other** — they meet in SpacetimeDB.

### The components and who does what
```
Next.js (Vercel)      the canvas UI + thin API. Talks ONLY to SpacetimeDB.
MCP server            the tool surface. create_scenario / run_simulation / …
SpacetimeDB           shared state + the meeting point. Everyone subscribes.
Worker (Python)       heavy lifter. Runs MiroFish. Talks ONLY to SpacetimeDB.
MiroFish / OASIS      the actual simulation (LLM-driven agents).
LLM API               the real cost centre.
```
> Why this shape: Vercel serverless can't run a 5-minute Python sim, and we don't
> want the UI holding a connection open for minutes. So the worker lives
> elsewhere (Fly.io / Railway / a VM / your own box) and the two sides are
> decoupled through SpacetimeDB. Neither needs to know where the other is.

### The flow, step by step
```
1. Agent/UI → MCP: run_simulation(scenario_id, tier)
2. MCP → reducer submit_run  →  run row {status:"queued"}      (returns run_id NOW)
3. Worker is subscribed to `run`. It claims the job atomically
      (reducer flips queued→claimed w/ worker_id; only one worker wins)
4. status:"building_graph"  — check persona_graph cache; reuse if fresh,
      else build the GraphRAG from seeds and store the blob
5. status:"simulating"      — configure OASIS agents from community/persona rows,
      sized by tier. THEN run the loop, and after each round:
         emit a batch of `frame` rows  (reducer record_frame) + bump progress
      ← this per-round emit is what streams the scrubber live
6. status:"summarizing"     — ReportAgent → verdict row (outcome, confidence,
      cascade_json)
7. status:"done"
   The canvas was subscribed to `frame` + `verdict` the whole time and animated
   as rows arrived. No polling.
```
Status lifecycle: `queued → claimed → building_graph → simulating → summarizing →
done | failed`. Keep `run.progress` (0–1) so the UI shows a real bar.

### The one hard part: getting per-step frames out of MiroFish
MiroFish natively emits a **final** report + `verdict.json` — **not** a per-step
timeline. But the scrubber needs every node's state at each step. Three ways to
get it, in order of preference:

- **A — hook the loop (target).** OASIS runs in discrete rounds; extend it with a
  per-round callback that snapshots agent stances + utterances and writes frames.
  It's AGPL and open, so this is a fair-game patch. Cleanest, truly live.
- **B — segment + snapshot.** Run the sim in short segments, snapshot between
  them. Coarser timeline, no deep patching.
- **C — post-hoc reconstruct (v1 fallback).** Let it finish, then parse the
  interaction log (who posted what, when) and rebuild frames after the fact. Not
  live, but ships without touching MiroFish internals.

**Plan: build C first to prove the loop, move to A for the real product.** Flag
this now because if we design as if frames come free, the scrubber becomes
impossible to add later.

### Cost & tiers (the LLM bill is the whole cost)
| Tier | Agents | Rounds | Model mix | ~Cost |
|------|-------:|-------:|-----------|------:|
| `quick`    | dozens    | few  | small model only            | cents |
| `standard` | hundreds  | more | small crowd + smart summary | ~$3 |
| `deep`     | thousands | many | bigger crowd + smart summary| ~$18 |

- Estimate cost up front (`tier × agents × rounds × model price`), show it before
  Run, and enforce a **hard cap** — a run can never silently blow past its tier.
- **Reuse** the persona graph across runs; **share** identical (scenario, tier,
  graph_version) results instead of re-running. This is what keeps it a $5 tool.

### Failure & fairness
- **Atomic claim** so two workers never run the same job.
- **Dedup**: an identical fresh run returns the cached result, no new spend.
- **Frame volume**: nodes × steps. Community-level frames are tiny; individual
  traces (thousands of agents) are big — store those sampled/compressed and load
  a node's detailed trace only when someone drills in.
- On crash → `status:"failed"` + reason; the UI offers a re-run; no half-charged
  silent hangs.

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
- [x] Canvas UX: semantic zoom (communities ↔ individuals), build + replay modes
- [x] Interactive mockup of the canvas (`docs/mockup.html`)
- [x] Run pipeline: async job via SpacetimeDB, worker topology, frame-emit strategy
- [x] SpacetimeDB tables + reducers written as real code (`spacetime/src/lib.rs`)
- [ ] Pick the graph rendering lib (semantic zoom + replay animation)
- [ ] Stub the MCP tool surface (incl. `define_persona`)
- [ ] `spacetime build` + generate TS bindings, wire into the app
- [ ] Wire MiroFish cheap-mode behind `run_simulation` (must emit per-step frames)
- [ ] Thin Next.js UI: the canvas, one user, one scenario
