# MCP tool contracts

The engine is an **MCP server**. Any agent connects and drives the same tools.
Every tool is a thin wrapper over a SpacetimeDB reducer or subscription — the MCP
layer holds no state of its own.

Runs are async, but MCP calls are request/response. So `run_simulation` returns a
`run_id` immediately, and an agent that can't hold a live subscription **polls**
`get_run_status` / `get_verdict`. A subscribing client (the canvas) skips polling
and just watches the tables.

---

## Authoring

### `create_scenario`
Create a decision to war-game.
```jsonc
in:  { "description": "We're launching an AI note-taker", "audience": "tech twitter" }
out: { "scenario_id": 42 }
```
→ reducer `create_scenario`

### `define_persona`
Add one shaper. Use **archetype** profiles, not named real people (see the
responsible-use note in the design doc).
```jsonc
in:  { "scenario_id": 42, "community_id": 7,
       "role": "tech journalist", "lean": "progressive",
       "platform": "X + newsletter", "reach": 4, "tone": "skeptical" }
out: { "persona_id": 88 }
```
→ reducer `add_persona`

### `add_community`
Add a zoomed-out region.
```jsonc
in:  { "scenario_id": 42, "label": "crypto twitter", "lean": "mixed", "size": 100000, "tier": 2 }
out: { "community_id": 7 }
```
→ reducer `add_community`

### `link_influence`
Connect two personas.
```jsonc
in:  { "scenario_id": 42, "from_persona": 88, "to_persona": 91, "weight": 0.6 }
out: { "ok": true }
```
→ reducer `add_edge`

---

## Running

### `estimate_cost`
Read-only. Compute the up-front price so the agent (or user) sees it **before**
spending. The worker enforces this as a hard cap.
```jsonc
in:  { "scenario_id": 42, "tier": "standard" }
out: { "tier": "standard", "agents": 240, "rounds": 6, "usd": 3.10 }
```
→ pure calc from scenario size × tier (no reducer)

### `run_simulation`
Queue a run. Returns immediately.
```jsonc
in:  { "scenario_id": 42, "tier": "standard" }
out: { "run_id": 5001, "status": "queued" }
```
→ reducer `submit_run`

### `get_run_status`
Poll progress.
```jsonc
in:  { "run_id": 5001 }
out: { "status": "simulating", "progress": 0.55, "latest_step": 3 }
```
→ subscription read on `run` + `frame`

### `get_frames`
Pull the timeline (for clients that can't subscribe). `since_step` for deltas.
```jsonc
in:  { "run_id": 5001, "since_step": 0 }
out: { "frames": [ { "step": 1, "node_ref": "community:7", "state": "amplify", "said": "..." } ] }
```
→ subscription read on `frame`

### `get_verdict`
The final answer. 404s until status is `done`.
```jsonc
in:  { "run_id": 5001 }
out: { "outcome": "Spreads — within tech, stalls beyond", "confidence": 0.78,
       "summary": "...", "cascade": [ ... ] }
```
→ subscription read on `verdict`

---

## Auth & limits (before this is public)
- Each MCP session carries an identity → it can only read/write its own
  scenarios once row-level rules exist (not yet — everything is public today).
- `run_simulation` is the only spend-triggering tool. Rate-limit it per identity
  and require `estimate_cost` to have been acknowledged over the tier a user has
  approved. The hard cap still lives in the worker regardless.
