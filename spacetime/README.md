# Scenario Engine — SpacetimeDB module

The shared state layer. Per the run-pipeline design, the Next.js UI and the
Python worker **never call each other** — they both talk to these tables.

- `src/lib.rs` — tables + reducers (Rust, targets SpacetimeDB 2.6)
- Tables: `scenario`, `community`, `persona`, `edge`, `persona_graph`, `run`,
  `frame`, `verdict`, `subscriber`
- Enums: `BudgetTier`, `RunStatus`, `NodeState`

## Build & publish

```bash
# install once: https://spacetimedb.com/install
spacetime build
spacetime publish scenario-engine        # add --project-path spacetime if run from repo root
```

Generate typed client bindings for the app:

```bash
spacetime generate --lang typescript --out-dir ../app/spacetime_bindings
```

## Who writes what

| Reducer | Called by | Purpose |
|---|---|---|
| `create_scenario`, `add_community`, `add_persona`, `add_edge` | UI / MCP agent | author the world |
| `cache_persona_graph` | worker | reuse the GraphRAG across runs |
| `submit_run` | UI / MCP agent | queue a run (returns immediately) |
| `claim_run` | worker | atomically take a queued run |
| `bump_status` | worker | push lifecycle + progress |
| `record_frames` | worker | stream the per-step timeline (feeds the scrubber) |
| `record_verdict` | worker | write the final answer |

## Subscriptions

**UI (the canvas)** — everything for one scenario and its active run:

```sql
SELECT * FROM scenario  WHERE id = :sid;
SELECT * FROM community WHERE scenario_id = :sid;
SELECT * FROM persona   WHERE scenario_id = :sid;
SELECT * FROM edge      WHERE scenario_id = :sid;
SELECT * FROM run       WHERE scenario_id = :sid;
SELECT * FROM frame     WHERE run_id = :rid;   -- scrubber animates as rows arrive
SELECT * FROM verdict   WHERE run_id = :rid;
```

**Worker (the queue)** — watch for jobs to claim:

```sql
SELECT * FROM run WHERE status = 'Queued';
```

The worker reacts to inserts here, calls `claim_run`, and — because reducers are
transactional — only one worker wins the claim.

## M1 — turning on the real backend

Scaffold is in place; here's the order to light it up.

**1. Stand up the database**
```bash
spacetime start &                 # local instance
spacetime publish scenario-engine # from this dir
```

**2. Point the worker at it** (`spacetime/worker/`)
```bash
cp .env.example .env              # then edit .env
pip install -r requirements.txt
python worker.py                  # USE_MIROFISH=0 → heuristic, no LLM spend
```
With `USE_MIROFISH=0` the worker runs the same heuristic as the UI stub — so you
can watch a run go queued → simulating → done against a **real** DB before
spending anything. Flip `USE_MIROFISH=1` (and set `LLM_API_KEY` + `MIROFISH_PATH`)
once `run_mirofish()` is implemented.

**3. Swap the UI onto the real engine** (`spacetime/client/SpacetimeEngine.ts`)
```bash
npm i @clockworklabs/spacetimedb-sdk
spacetime generate --lang typescript --out-dir spacetime/client/module_bindings
```
Then move `SpacetimeEngine.ts` (+ `module_bindings`) under `app/engine/` and have
the page construct it via the `makeEngine()` factory instead of `new StubEngine()`.
The canvas code doesn't change — same `Engine` interface.

**What still needs you:** an `LLM_API_KEY` (step 2) and, for the real sim, a
cloned MiroFish at `MIROFISH_PATH`. Everything else above is copy-paste.

## Notes / follow-ups

- `cost_estimate` lives on the row for display; the **hard cap** is enforced in
  the worker before it spends on LLM calls, not in the DB.
- `frame` volume = nodes × steps. Community-level frames are tiny; store
  individual-agent traces sampled/compressed and load a node's detail on drill-in.
- Row-level access rules (who can read whose scenarios) are not modelled yet —
  everything is `public` for now. Add RLS before this holds real users' data.
