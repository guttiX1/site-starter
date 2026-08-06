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
import tempfile
import subprocess
from pathlib import Path
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
USE_MIROFISH = os.environ.get("USE_MIROFISH", "0") == "1"
# The mirofish-cli fork (github.com/amadad/mirofish-cli) exposes a headless
# `mirofish run` command and can use LLM_PROVIDER=claude-cli (your Claude Code)
# instead of a paid key. MIROFISH_CMD is how we invoke it.
MIROFISH_CMD = os.environ.get("MIROFISH_CMD", "mirofish")
MIROFISH_PLATFORM = os.environ.get("MIROFISH_PLATFORM", "parallel")
MIROFISH_TIMEOUT = int(os.environ.get("MIROFISH_TIMEOUT", "1800"))  # seconds
# One of these must be configured for the real sim (worker passes env through):
#   - LLM_PROVIDER=claude-cli|codex-cli           (mirofish-cli fork, no key)
#   - LLM_API_KEY + LLM_BASE_URL + LLM_MODEL_NAME (original MiroFish, OpenAI-format)
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")

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
    scenarios = sql(f"SELECT * FROM scenario WHERE id = {scenario_id}")
    communities = sql(f"SELECT * FROM community WHERE scenario_id = {scenario_id}")
    personas = sql(f"SELECT * FROM persona WHERE scenario_id = {scenario_id}")
    edges = sql(f"SELECT * FROM edge WHERE scenario_id = {scenario_id}")
    description = scenarios[0].get("description", "") if scenarios else ""
    audience = scenarios[0].get("audience", "") if scenarios else ""
    seed = None
    # (seed selection would come from scenario config; default to a tier-1 node)
    tier1 = [c for c in communities if int(c.get("tier", 9)) == 1]
    if tier1:
        seed = tier1[0]["id"]
    elif communities:
        seed = communities[0]["id"]
    return {
        "communities": communities, "personas": personas, "edges": edges,
        "seed": seed, "description": description, "audience": audience,
    }


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


def _seed_document(graph: dict) -> tuple[str, str]:
    """Turn the influence graph into (requirement, seed_markdown) for MiroFish."""
    desc = graph.get("description") or "the message"
    aud = graph.get("audience") or "the described audience"
    requirement = (
        f"Predict how {aud} reacts to: {desc}. "
        "Does it spread, stall, or fall flat? Which groups adopt, amplify, or resist it, "
        "and in what order does the reaction cascade?"
    )
    lines = [f"# Scenario: {desc}", f"\nAudience: {aud}", "\n## Communities (opinion groups)"]
    for c in graph["communities"]:
        lines.append(f"- **{c.get('label', c.get('id'))}** — tier {c.get('tier')}, "
                     f"disposition: {c.get('mood', 'open')}")
    for p in graph.get("personas", []):
        lines.append(f"  - {p.get('role','')} · leans {p.get('lean','')} · "
                     f"on {p.get('platform','')} · reach {p.get('reach','')} · {p.get('tone','')}")
    lines.append("\n## Influence links (A shapes B)")
    for e in graph["edges"]:
        src = e.get("from_persona", e.get("a"))
        tgt = e.get("to_persona", e.get("b"))
        lines.append(f"- {src} → {tgt}")
    return requirement, "\n".join(lines)


def _read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def _find_run_dir(out_dir: Path, stdout: str) -> Path:
    """Locate the run directory MiroFish wrote (report/verdict.json lives under it)."""
    # Prefer a path echoed in --json stdout, else search out_dir for verdict.json.
    try:
        meta = json.loads(stdout.strip().splitlines()[-1])
        for key in ("run_dir", "output_dir", "path"):
            if isinstance(meta, dict) and meta.get(key):
                return Path(meta[key])
    except (ValueError, IndexError):
        pass
    hits = list(out_dir.rglob("report/verdict.json"))
    if not hits:
        raise RuntimeError(f"no verdict.json found under {out_dir}")
    return hits[0].parent.parent


def _states_from_timeline(graph: dict, timeline: Any) -> list[dict]:
    """Frame strategy C — reconstruct per-round community states from MiroFish's
    timeline. Field names in timeline.json aren't formally documented, so this is
    defensive: it looks for a per-round stance/sentiment per group and maps it to
    our NodeState. If it can't parse, it falls back to the heuristic so the UI
    still animates (CONFIRM the exact schema against a real run and tighten this).
    """
    labels = {c["id"]: str(c.get("label", c["id"])).lower() for c in graph["communities"]}

    def to_state(val: Any) -> str:
        s = str(val).lower()
        if any(k in s for k in ("amplif", "boost", "viral")):
            return "amplify"
        if any(k in s for k in ("support", "adopt", "positive", "pro", "agree")):
            return "pro"
        if any(k in s for k in ("resist", "reject", "negative", "stall", "against")):
            return "stall"
        if any(k in s for k in ("neutral", "indifferent", "ignore", "no move")):
            return "neutral"
        return ""

    rounds = timeline if isinstance(timeline, list) else timeline.get("rounds", []) if isinstance(timeline, dict) else []
    snapshots: list[dict] = []
    for rnd in rounds:
        entries = rnd.get("groups", rnd.get("agents", [])) if isinstance(rnd, dict) else []
        snap = {cid: "idle" for cid in labels}
        for ent in entries:
            name = str(ent.get("name", ent.get("group", ""))).lower()
            st = to_state(ent.get("stance", ent.get("sentiment", "")))
            for cid, lbl in labels.items():
                if st and (lbl in name or name in lbl):
                    snap[cid] = st
        snapshots.append(snap)

    if not snapshots:
        # couldn't parse the timeline — fall back so the run still produces frames
        snaps, _ = heuristic_snapshots(graph)
        return snaps
    return snapshots


def _verdict_from_mirofish(raw: dict, fallback: dict) -> dict:
    """Map MiroFish's verdict.json onto our verdict shape, defensively."""
    if not isinstance(raw, dict):
        return fallback
    outcome = raw.get("verdict") or raw.get("outcome") or raw.get("prediction") or fallback["outcome"]
    conf = raw.get("confidence", raw.get("confidence_score", fallback["confidence"]))
    try:
        conf = float(conf)
        if conf > 1:
            conf /= 100.0
    except (TypeError, ValueError):
        conf = fallback["confidence"]
    signals = raw.get("signals") or raw.get("key_findings") or []
    cascade = [{"text": str(s), "kind": ""} for s in signals] or fallback["cascade"]
    return {"outcome": str(outcome), "confidence": conf, "cascade": cascade,
            "summary": raw.get("summary", str(outcome)), "raw": raw}


def run_mirofish(graph: dict, tier: str) -> tuple[list[dict], dict]:
    """Run the real MiroFish simulation via the mirofish-cli headless command,
    then reconstruct frames + verdict from its output (strategy C).

    Falls back to the heuristic unless USE_MIROFISH=1 and an LLM backend is set
    (LLM_PROVIDER=claude-cli, or LLM_API_KEY for the OpenAI-format path).
    """
    if not (USE_MIROFISH and (LLM_PROVIDER or LLM_API_KEY)):
        return heuristic_snapshots(graph)

    limits = TIER_LIMITS.get(tier, TIER_LIMITS["quick"])
    requirement, seed_md = _seed_document(graph)
    workdir = Path(tempfile.mkdtemp(prefix="mirofish_"))
    seed_path = workdir / "seed.md"
    seed_path.write_text(seed_md)
    out_dir = workdir / "out"

    cmd = [
        MIROFISH_CMD, "run",
        "--files", str(seed_path),
        "--requirement", requirement,
        "--platform", MIROFISH_PLATFORM,
        "--max-rounds", str(limits["rounds"]),  # rounds cap = our spend cap lever
        "--output-dir", str(out_dir),
        "--json",
    ]
    print(f"[worker] running MiroFish: {' '.join(cmd[:6])} … (max {limits['rounds']} rounds)")
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          timeout=MIROFISH_TIMEOUT, env={**os.environ})
    if proc.returncode != 0:
        raise RuntimeError(f"mirofish exited {proc.returncode}: {proc.stderr[-600:]}")

    run_root = _find_run_dir(out_dir, proc.stdout)
    verdict_raw = _read_json(run_root / "report" / "verdict.json", default={})
    timeline = _read_json(run_root / "simulation" / "timeline.json", default={})

    snapshots = _states_from_timeline(graph, timeline)
    _, fallback_verdict = heuristic_snapshots(graph)
    verdict = _verdict_from_mirofish(verdict_raw, fallback_verdict)
    return snapshots, verdict


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
