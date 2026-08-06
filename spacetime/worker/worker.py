#!/usr/bin/env python3
"""Scenario Engine — simulation worker (M1 scaffold).

The heavy half of the run pipeline. It never talks to the web app directly — it
only talks to SpacetimeDB, exactly like the design says:

    poll for a queued run  ->  claim it (atomic)  ->  build/reuse the graph  ->
    run the sim, streaming a batch of `frame` rows per round  ->  write verdict.

It talks to SpacetimeDB over the HTTP API (reducer calls + one-off SQL reads), so
it needs no generated Python bindings. Fill in .env (copy .env.example) and run:

    pip install -r requirements.txt
    python worker.py

Until MiroFish is wired in (see run_simulation below), it uses a built-in
heuristic identical to the TS stub, so you can prove the end-to-end loop against
a real database BEFORE spending a cent on LLM calls.
"""
from __future__ import annotations

import os
import time
import json
from collections import deque
from typing import Any

import requests  # requirements.txt

# --------------------------------------------------------------------------
# config
# --------------------------------------------------------------------------
BASE = os.environ.get("SPACETIME_URI", "http://localhost:3000").rstrip("/")
MODULE = os.environ.get("SPACETIME_MODULE", "scenario-engine")
TOKEN = os.environ.get("SPACETIME_TOKEN", "")          # optional auth
POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "2"))

# LLM / MiroFish (only needed once you turn on the real sim)
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")
MIROFISH_PATH = os.environ.get("MIROFISH_PATH", "")     # path to a cloned 666ghj/MiroFish
USE_MIROFISH = os.environ.get("USE_MIROFISH", "0") == "1"

# per-tier hard caps — the worker refuses to exceed these no matter what
TIER_LIMITS = {
    "quick":    {"agents": 40,   "rounds": 6,  "usd_cap": 1.0},
    "standard": {"agents": 240,  "rounds": 10, "usd_cap": 5.0},
    "deep":     {"agents": 2200, "rounds": 16, "usd_cap": 25.0},
}

# NOTE: SpacetimeDB's HTTP path prefix has moved between versions (older builds
# use /database/..., 2.x uses /v1/database/...). Adjust here if calls 404.
API = f"{BASE}/v1/database/{MODULE}"
HEADERS = {"Content-Type": "application/json"}
if TOKEN:
    HEADERS["Authorization"] = f"Bearer {TOKEN}"


# --------------------------------------------------------------------------
# SpacetimeDB HTTP helpers
# --------------------------------------------------------------------------
def call_reducer(name: str, args: list[Any]) -> None:
    """Invoke a reducer with a positional-args JSON array."""
    r = requests.post(f"{API}/call/{name}", headers=HEADERS, data=json.dumps(args), timeout=30)
    r.raise_for_status()


def sql(query: str) -> list[dict]:
    """Run a one-off read query and return rows as dicts."""
    r = requests.post(f"{API}/sql", headers=HEADERS, data=json.dumps(query), timeout=30)
    r.raise_for_status()
    out = r.json()
    # SpacetimeDB returns a list of statement results; flatten the first.
    if not out:
        return []
    first = out[0]
    cols = [c["name"] if isinstance(c, dict) else c for c in first.get("schema", {}).get("elements", [])] \
        if isinstance(first.get("schema"), dict) else first.get("columns", [])
    rows = first.get("rows", [])
    # rows may be list-of-lists (positional) or list-of-dicts already
    if rows and isinstance(rows[0], dict):
        return rows
    return [dict(zip(cols, row)) for row in rows]


# --------------------------------------------------------------------------
# the sim
# --------------------------------------------------------------------------
def load_graph(scenario_id: int) -> dict:
    communities = sql(f"SELECT * FROM community WHERE scenario_id = {scenario_id}")
    edges = sql(f"SELECT * FROM edge WHERE scenario_id = {scenario_id}")
    seed = None
    # (seed selection would come from scenario config; default to a tier-1 node)
    tier1 = [c for c in communities if int(c.get("tier", 9)) == 1]
    if tier1:
        seed = tier1[0]["id"]
    elif communities:
        seed = communities[0]["id"]
    return {"communities": communities, "edges": edges, "seed": seed}


def heuristic_snapshots(graph: dict) -> tuple[list[dict], dict]:
    """Same propagation model as the TS stub — lets you test the loop with no LLM.
    Returns (snapshots, verdict) where each snapshot maps node_id -> state."""
    communities = {c["id"]: c for c in graph["communities"]}
    edges = graph["edges"]
    seed = graph["seed"]

    def mood_state(c: dict) -> str:
        mood, tier = c.get("mood", "open"), int(c.get("tier", 1))
        if mood == "contrarian":
            return "stall"
        if mood == "mass" or tier >= 3:
            return "neutral"
        if mood == "amplifier":
            return "amplify"
        return "pro"

    state: dict[str, str] = {}
    order: list[str] = []
    if seed:
        state[seed] = "seed"
        order.append(seed)

    def snap() -> dict:
        return {cid: state.get(cid, "idle") for cid in communities}

    snapshots = [snap()]
    frontier = deque([seed] if seed else [])
    guard = 0
    while frontier and guard < 20:
        guard += 1
        nxt = []
        for node in list(frontier):
            if state.get(node) not in ("seed", "pro", "amplify"):
                continue
            for e in edges:
                # the `edge` table uses from_persona/to_persona; accept a/b too
                src = e.get("from_persona", e.get("a"))
                tgt = e.get("to_persona", e.get("b"))
                if src != node or tgt in state or tgt not in communities:
                    continue
                state[tgt] = mood_state(communities[tgt])
                order.append(tgt)
                nxt.append(tgt)
        if not nxt:
            break
        snapshots.append(snap())
        frontier = deque(nxt)

    moved = sum(1 for i in order if state[i] in ("seed", "pro", "amplify"))
    amplified = any(state[i] == "amplify" for i in order)
    frac = moved / max(1, len(communities))
    conf = max(0.4, min(0.9, 0.35 + frac * 0.6))
    if amplified and frac >= 0.5:
        outcome = "Spreads — within tech, stalls beyond"
    elif moved <= 1:
        outcome = "Falls flat — never leaves the seed"
    else:
        outcome = "Partial reach — moves some, not all"
    cascade = []
    for i, cid in enumerate(order):
        st = state[cid]
        label = communities[cid].get("label", cid)
        if i == 0:
            cascade.append({"text": f"Seeded at {label}", "kind": "good"})
        elif st == "stall":
            cascade.append({"text": f"{label} ignores it — stalled", "kind": "bad"})
        elif st == "neutral":
            cascade.append({"text": f"{label} — no real move", "kind": ""})
        else:
            cascade.append({"text": f"{label} picks it up", "kind": "good"})
    verdict = {"outcome": outcome, "confidence": conf,
               "cascade": cascade, "summary": outcome, "raw": {}}
    return snapshots, verdict


def run_mirofish(graph: dict, tier: str) -> tuple[list[dict], dict]:
    """TODO(M1-real): run the actual MiroFish simulation.

    Steps, per the design doc:
      1. Build/reuse the GraphRAG (cache via cache_persona_graph).
      2. Configure OASIS agents from `communities`/`persona`, sized to
         TIER_LIMITS[tier]["agents"], cheap model for the crowd.
      3. Run the rounds. Frame strategy C (ship first): let it finish, then parse
         the interaction log and reconstruct per-step snapshots. Strategy A
         (later): hook the OASIS round loop to emit snapshots live.
      4. Return (snapshots, verdict) in the same shape as heuristic_snapshots.

    Requires: MIROFISH_PATH set, LLM_API_KEY set. Enforce TIER_LIMITS[usd_cap]
    BEFORE spending. Until implemented, we fall back to the heuristic.
    """
    if not (USE_MIROFISH and MIROFISH_PATH and LLM_API_KEY):
        return heuristic_snapshots(graph)
    raise NotImplementedError(
        "MiroFish integration not wired yet — see run_mirofish() TODO. "
        "Set USE_MIROFISH=0 to run the heuristic against a real DB."
    )


def process_run(run: dict) -> None:
    run_id = int(run["id"])
    scenario_id = int(run["scenario_id"])
    tier = str(run.get("tier", "quick")).lower()
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["quick"])
    print(f"[worker] claiming run {run_id} (scenario {scenario_id}, tier {tier})")

    # atomic claim — if another worker won, this raises and we skip
    try:
        call_reducer("claim_run", [run_id])
    except requests.HTTPError as e:
        print(f"[worker] could not claim run {run_id}: {e}")
        return

    try:
        call_reducer("bump_status", [run_id, "BuildingGraph", 0.08])
        graph = load_graph(scenario_id)

        snapshots, verdict = run_mirofish(graph, tier)  # heuristic until MiroFish is on
        last = max(1, len(snapshots) - 1)

        for step, snap in enumerate(snapshots):
            frames = [
                {"step": step, "node_ref": f"community:{cid}", "state": _cap(state), "said": ""}
                for cid, state in snap.items()
            ]
            call_reducer("record_frames", [run_id, frames])
            call_reducer("bump_status", [run_id, "Simulating", 0.1 + (step / last) * 0.8])

        call_reducer("bump_status", [run_id, "Summarizing", 0.95])
        call_reducer("record_verdict", [
            run_id, verdict["outcome"], float(verdict["confidence"]),
            verdict.get("summary", verdict["outcome"]),
            json.dumps(verdict["cascade"]), json.dumps(verdict.get("raw", {})),
        ])
        call_reducer("bump_status", [run_id, "Done", 1.0])
        print(f"[worker] run {run_id} done: {verdict['outcome']}")
    except Exception as e:  # noqa: BLE001 — surface failure to the UI, don't hang
        print(f"[worker] run {run_id} FAILED: {e}")
        try:
            call_reducer("bump_status", [run_id, "Failed", 0.0])
        except requests.HTTPError:
            pass


def _cap(state: str) -> str:
    # NodeState enum variants are PascalCase in the module; frames carry the
    # lowercase string. record_frames takes the enum tag — map here.
    return {"seed": "Seed", "pro": "Pro", "amplify": "Amplify",
            "neutral": "Neutral", "stall": "Stall", "idle": "Idle"}.get(state, "Idle")


def main() -> None:
    print(f"[worker] watching {API} for queued runs (every {POLL_SECONDS}s)")
    seen: set[int] = set()
    while True:
        try:
            runs = sql("SELECT * FROM run")
            for run in runs:
                if str(run.get("status")) in ("Queued", "queued") and int(run["id"]) not in seen:
                    seen.add(int(run["id"]))
                    process_run(run)
        except requests.RequestException as e:
            print(f"[worker] poll error (will retry): {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
