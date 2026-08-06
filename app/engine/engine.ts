// Scenario Engine — M0 engine client + a graph-driven heuristic "sim".
//
// This mirrors the SpacetimeDB reducer + subscription contract from
// spacetime/src/lib.rs, backed by an in-memory model instead of a live DB.
// The cascade is NOT scripted — `simulate()` propagates over the current graph,
// so editing moods, tiers, edges, or the seed changes the outcome. In M1 you
// replace `StubEngine` with a `SpacetimeEngine` (+ real MiroFish); the component
// never changes.

export type NodeState = "seed" | "pro" | "amplify" | "neutral" | "stall" | "idle";
export type BudgetTier = "quick" | "standard" | "deep";
export type RunStatus =
  | "queued" | "claimed" | "building_graph" | "simulating" | "summarizing" | "done" | "failed";
export type Mood = "open" | "amplifier" | "contrarian" | "mass";

export interface Community {
  id: string; label: string; sub: string; x: number; y: number; r: number;
  tier: number; mood: Mood;
}
export interface Edge { a: string; b: string; } // a influences b
export interface Persona {
  role: string; lean: string; platform: string; reach: number; tone: string;
  said: string;
}
export interface Frame { step: number; node_ref: string; state: NodeState; said: string; }
export interface Verdict {
  outcome: string; confidence: number;
  cascade: { text: string; kind: "good" | "bad" | "" }[];
}
export interface RunState { runId: number; status: RunStatus; progress: number; }
export interface Individual { label: string; hold?: boolean; }

/** The whole editable world (stands in for the scenario/community/persona rows). */
export const world = {
  seedId: "vc",
  communities: [
    { id: "vc",     label: "VC / founders",   sub: "tier 1", x: 250, y: 150, r: 46, tier: 1, mood: "open" as Mood },
    { id: "press",  label: "Tech press",      sub: "tier 1", x: 340, y: 330, r: 56, tier: 1, mood: "open" as Mood },
    { id: "crypto", label: "Crypto twitter",  sub: "tier 2", x: 600, y: 230, r: 50, tier: 2, mood: "amplifier" as Mood },
    { id: "forum",  label: "Niche forum",     sub: "tier 2", x: 560, y: 460, r: 40, tier: 2, mood: "contrarian" as Mood },
    { id: "suburb", label: "Suburban voters", sub: "tier 3", x: 810, y: 390, r: 52, tier: 3, mood: "mass" as Mood },
  ] as Community[],
  edges: [
    { a: "vc", b: "press" }, { a: "vc", b: "crypto" }, { a: "press", b: "crypto" },
    { a: "press", b: "forum" }, { a: "crypto", b: "suburb" }, { a: "crypto", b: "forum" },
  ] as Edge[],
  profiles: {
    vc:     { role: "investor / founder", lean: "techno-libertarian", platform: "X threads", reach: 5, tone: "hype", said: "this is the missing piece — sharing with the whole portfolio" },
    press:  { role: "journalist", lean: "progressive", platform: "X + newsletter", reach: 4, tone: "skeptical", said: "skeptical at first, but the numbers changed my mind — worth a look" },
    crypto: { role: "influencer", lean: "mixed / mercenary", platform: "X", reach: 5, tone: "hype", said: "ok this is actually bullish, the narrative writes itself" },
    forum:  { role: "community", lean: "contrarian", platform: "forum", reach: 2, tone: "jaded", said: "seen ten launches like this, not biting" },
    suburb: { role: "mass segment", lean: "centrist", platform: "Facebook", reach: 5, tone: "indifferent", said: "not sure this really matters to me" },
  } as Record<string, Persona>,
  individuals: {
    vc:     [{ label: "Seed investor" }, { label: "Solo founder" }, { label: "Growth angel" }, { label: "Skeptic LP", hold: true }],
    press:  [{ label: "Senior journalist" }, { label: "Site editor" }, { label: "Newsletter writer" }, { label: "Junior reporter", hold: true }],
    crypto: [{ label: "Big anon account" }, { label: "Meme page" }, { label: "Alpha caller" }, { label: "Retail holder", hold: true }],
    forum:  [{ label: "Mod" }, { label: "Power user" }, { label: "Lurker" }],
    suburb: [{ label: "Parent group" }, { label: "Local page" }, { label: "Commuter" }, { label: "Retiree", hold: true }],
  } as Record<string, Individual[]>,
};

const moodState = (mood: Mood, tier: number): NodeState => {
  if (mood === "contrarian") return "stall";
  if (mood === "mass" || tier >= 3) return "neutral";
  if (mood === "amplifier") return "amplify";
  return "pro";
};

/** Breadth-first propagation from the seed along edge direction (a influences b).
 *  Returns one snapshot per step + a verdict. Deterministic; reacts to edits. */
export function simulate(): { snapshots: Record<string, NodeState>[]; verdict: Verdict } {
  const { communities, edges, seedId } = world;
  const ids = communities.map((c) => c.id);
  const moodOf = (id: string) => communities.find((c) => c.id === id)!.mood;
  const tierOf = (id: string) => communities.find((c) => c.id === id)!.tier;
  const labelOf = (id: string) => communities.find((c) => c.id === id)!.label;

  const state: Record<string, NodeState> = {};
  const order: string[] = [];
  const seed = ids.includes(seedId) ? seedId : ids[0];
  state[seed] = "seed"; order.push(seed);

  const snapshot = (): Record<string, NodeState> => {
    const s: Record<string, NodeState> = {};
    ids.forEach((id) => (s[id] = state[id] || "idle"));
    return s;
  };
  const snapshots = [snapshot()];

  let frontier = [seed];
  let guard = 0;
  while (frontier.length && guard++ < 20) {
    const next: string[] = [];
    for (const node of frontier) {
      // only actively-engaged nodes spread; stalled/neutral are dead ends
      if (!["seed", "pro", "amplify"].includes(state[node])) continue;
      for (const e of edges) {
        if (e.a !== node || state[e.b]) continue;
        state[e.b] = moodState(moodOf(e.b), tierOf(e.b));
        order.push(e.b);
        next.push(e.b);
      }
    }
    if (!next.length) break;
    snapshots.push(snapshot());
    frontier = next;
  }

  // ---- verdict ----
  const moved = order.filter((id) => ["seed", "pro", "amplify"].includes(state[id])).length;
  const amplified = order.some((id) => state[id] === "amplify");
  const stalled = order.filter((id) => state[id] === "stall").length;
  const reachedBeyondTier1 = order.some((id) => tierOf(id) >= 2 && ["pro", "amplify"].includes(state[id]));
  const frac = moved / ids.length;
  const confidence = Math.max(0.4, Math.min(0.9, 0.35 + frac * 0.6));

  let outcome: string;
  if (amplified && reachedBeyondTier1 && frac >= 0.5) outcome = "Spreads — within tech, stalls beyond";
  else if (moved <= 1) outcome = "Falls flat — never leaves the seed";
  else if (stalled >= 2) outcome = "Contained — resisted by key nodes";
  else outcome = "Partial reach — moves some, not all";

  const verb: Record<string, string> = { seed: "seeds it", pro: "picks it up", amplify: "amplifies the narrative", neutral: "— no real move", stall: "ignores it — stalled" };
  const cascade = order.map((id, i): { text: string; kind: "good" | "bad" | "" } => {
    const st = state[id];
    if (i === 0) return { text: `Seeded at ${labelOf(id)}`, kind: "good" };
    if (st === "stall") return { text: `${labelOf(id)} ${verb.stall}`, kind: "bad" };
    if (st === "neutral") return { text: `${labelOf(id)} ${verb.neutral}`, kind: "" };
    return { text: `${labelOf(id)} ${verb[st]}`, kind: "good" };
  });

  return { snapshots, verdict: { outcome, confidence, cascade } };
}

const COST: Record<BudgetTier, { agents: number; usd: number }> = {
  quick:    { agents: 40,   usd: 0.4 },
  standard: { agents: 240,  usd: 3.1 },
  deep:     { agents: 2200, usd: 18 },
};

export interface Engine {
  estimateCost(tier: BudgetTier): { tier: BudgetTier; agents: number; usd: number };
  runSimulation(
    tier: BudgetTier,
    onStatus: (s: RunState) => void,
    onFrames: (frames: Frame[]) => void,
    onVerdict: (v: Verdict) => void,
  ): { runId: number; cancel: () => void };
}

/** M0: computes the cascade from the current graph, then streams it on a timer
 *  to mimic a live worker calling record_frames each round. */
export class StubEngine implements Engine {
  private nextRunId = 5000;

  estimateCost(tier: BudgetTier) {
    return { tier, agents: COST[tier].agents, usd: COST[tier].usd };
  }

  runSimulation(
    tier: BudgetTier,
    onStatus: (s: RunState) => void,
    onFrames: (frames: Frame[]) => void,
    onVerdict: (v: Verdict) => void,
  ) {
    const runId = ++this.nextRunId;
    const { snapshots, verdict } = simulate();
    const last = snapshots.length - 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    onStatus({ runId, status: "queued", progress: 0 });
    at(180, () => onStatus({ runId, status: "building_graph", progress: 0.08 }));

    const stepDelay = 780;
    snapshots.forEach((snap, step) => {
      at(480 + step * stepDelay, () => {
        const frames: Frame[] = Object.keys(snap).map((id) => ({
          step,
          node_ref: `community:${id}`,
          state: snap[id],
          said: world.profiles[id]?.said ?? "",
        }));
        onFrames(frames);
        onStatus({ runId, status: "simulating", progress: 0.1 + (last ? step / last : 1) * 0.8 });
      });
    });

    const end = 480 + (last + 1) * stepDelay;
    at(end, () => onStatus({ runId, status: "summarizing", progress: 0.95 }));
    at(end + 380, () => {
      onVerdict(verdict);
      onStatus({ runId, status: "done", progress: 1 });
    });

    return { runId, cancel: () => timers.forEach(clearTimeout) };
  }
}
