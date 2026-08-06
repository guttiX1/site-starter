// Scenario Engine — M0 engine client.
//
// This is the seam. It mirrors the SpacetimeDB reducer + subscription contract
// from spacetime/src/lib.rs, but backed by a scripted in-memory stub instead of
// a live database. In M1 you replace `StubEngine` with a `SpacetimeEngine` that
// calls the generated bindings — the component below never has to change.

export type NodeState = "seed" | "pro" | "amplify" | "neutral" | "stall" | "idle";
export type BudgetTier = "quick" | "standard" | "deep";
export type RunStatus =
  | "queued" | "claimed" | "building_graph" | "simulating" | "summarizing" | "done" | "failed";

export interface Community { id: string; label: string; sub: string; x: number; y: number; r: number; }
export interface Edge { a: string; b: string; }
export interface Persona {
  role: string; lean: string; platform: string; reach: number; tone: string;
  said: string; flip: string; tip: string;
}
export interface Frame { step: number; node_ref: string; state: NodeState; said: string; }
export interface Verdict {
  outcome: string; confidence: number;
  cascade: { text: string; kind: "good" | "bad" | "" }[];
}
export interface RunState { runId: number; status: RunStatus; progress: number; }

export interface Individual { label: string; hold?: boolean; }

// --- the scripted world (stands in for scenario/community/persona/edge rows) ---
export const communities: Community[] = [
  { id: "vc",     label: "VC / founders",   sub: "tier 1", x: 250, y: 150, r: 46 },
  { id: "press",  label: "Tech press",      sub: "tier 1", x: 340, y: 330, r: 56 },
  { id: "crypto", label: "Crypto twitter",  sub: "tier 2", x: 600, y: 230, r: 50 },
  { id: "forum",  label: "Niche forum",     sub: "tier 2", x: 560, y: 460, r: 40 },
  { id: "suburb", label: "Suburban voters", sub: "tier 3", x: 810, y: 390, r: 52 },
];
export const edges: Edge[] = [
  { a: "vc", b: "press" }, { a: "vc", b: "crypto" }, { a: "press", b: "crypto" },
  { a: "press", b: "forum" }, { a: "crypto", b: "suburb" }, { a: "crypto", b: "forum" },
];
export const profiles: Record<string, Persona> = {
  vc:     { role: "investor / founder", lean: "techno-libertarian", platform: "X threads", reach: 5, tone: "hype", said: "this is the missing piece — sharing with the whole portfolio", flip: "backed it at t1", tip: "seeded directly" },
  press:  { role: "journalist", lean: "progressive", platform: "X + newsletter", reach: 4, tone: "skeptical", said: "skeptical at first, but the numbers changed my mind — worth a look", flip: "skeptical -> pro at t2", tip: "tipped by VC pick-up" },
  crypto: { role: "influencer", lean: "mixed / mercenary", platform: "X", reach: 5, tone: "hype", said: "ok this is actually bullish, the narrative writes itself", flip: "neutral -> amplify at t3", tip: "tipped by tech press" },
  forum:  { role: "community", lean: "contrarian", platform: "forum", reach: 2, tone: "jaded", said: "seen ten launches like this, not biting", flip: "stalled at t4", tip: "resisted crypto hype" },
  suburb: { role: "mass segment", lean: "centrist", platform: "Facebook", reach: 5, tone: "indifferent", said: "not sure this really matters to me", flip: "no real move", tip: "signal didn't reach" },
};
export const individuals: Record<string, Individual[]> = {
  vc:     [{ label: "Seed investor" }, { label: "Solo founder" }, { label: "Growth angel" }, { label: "Skeptic LP", hold: true }],
  press:  [{ label: "Senior journalist" }, { label: "Site editor" }, { label: "Newsletter writer" }, { label: "Junior reporter", hold: true }],
  crypto: [{ label: "Big anon account" }, { label: "Meme page" }, { label: "Alpha caller" }, { label: "Retail holder", hold: true }],
  forum:  [{ label: "Mod" }, { label: "Power user" }, { label: "Lurker" }],
  suburb: [{ label: "Parent group" }, { label: "Local page" }, { label: "Commuter" }, { label: "Retiree", hold: true }],
};

export const STEP_NAMES = ["seed", "", "pick-up", "amplify", "", "spread", "settled"];

// per-step community states the "sim" produces (missing => idle)
const SCRIPT: Record<string, NodeState>[] = [
  { press: "seed" },
  { press: "seed", vc: "pro" },
  { press: "pro", vc: "pro" },
  { press: "pro", vc: "pro", crypto: "amplify" },
  { press: "pro", vc: "pro", crypto: "amplify", forum: "stall" },
  { press: "pro", vc: "pro", crypto: "amplify", forum: "stall", suburb: "neutral" },
  { press: "pro", vc: "pro", crypto: "amplify", forum: "stall", suburb: "neutral" },
];
export const TOTAL_STEPS = SCRIPT.length - 1;

const VERDICT: Verdict = {
  outcome: "Spreads — within tech, stalls beyond",
  confidence: 0.78,
  cascade: [
    { text: "Seeded at Tech press", kind: "good" },
    { text: "VC / founders pick it up → press flips pro", kind: "good" },
    { text: "Crypto twitter amplifies the narrative", kind: "good" },
    { text: "Niche forum ignores it — stalled", kind: "bad" },
    { text: "Suburban voters — no real move", kind: "" },
  ],
};

const COST: Record<BudgetTier, { agents: number; usd: number }> = {
  quick:    { agents: 40,   usd: 0.4 },
  standard: { agents: 240,  usd: 3.1 },
  deep:     { agents: 2200, usd: 18 },
};

/** The contract the UI depends on. `StubEngine` and a future `SpacetimeEngine`
 *  both implement this. */
export interface Engine {
  estimateCost(tier: BudgetTier): { tier: BudgetTier; agents: number; usd: number };
  /** submit_run -> returns a run id immediately, then streams status + frames */
  runSimulation(
    tier: BudgetTier,
    onStatus: (s: RunState) => void,
    onFrames: (frames: Frame[]) => void,
    onVerdict: (v: Verdict) => void,
  ): { runId: number; cancel: () => void };
}

/** M0: scripted timeline streamed on a timer to mimic a live worker + subscription. */
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    onStatus({ runId, status: "queued", progress: 0 });
    at(200, () => onStatus({ runId, status: "building_graph", progress: 0.08 }));

    // stream one "round" of frames per step, like record_frames from the worker
    const stepDelay = 700;
    for (let step = 0; step <= TOTAL_STEPS; step++) {
      at(500 + step * stepDelay, () => {
        const frames: Frame[] = communities.map((c) => ({
          step,
          node_ref: `community:${c.id}`,
          state: SCRIPT[step][c.id] ?? "idle",
          said: profiles[c.id]?.said ?? "",
        }));
        onFrames(frames);
        onStatus({ runId, status: "simulating", progress: 0.1 + (step / TOTAL_STEPS) * 0.8 });
      });
    }

    const end = 500 + (TOTAL_STEPS + 1) * stepDelay;
    at(end, () => onStatus({ runId, status: "summarizing", progress: 0.95 }));
    at(end + 400, () => {
      onVerdict(VERDICT);
      onStatus({ runId, status: "done", progress: 1 });
    });

    return { runId, cancel: () => timers.forEach(clearTimeout) };
  }
}
