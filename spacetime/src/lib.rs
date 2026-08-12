//! Scenario Engine — SpacetimeDB module (Rust, targets 2.6).
//!
//! This is the **meeting point** from the run-pipeline design: the Next.js UI and
//! the Python simulation worker never call each other — they both talk to these
//! tables. The UI writes scenarios/personas and subscribes to `run` + `frame` +
//! `verdict`; the worker claims a `run`, streams `frame` rows as the sim
//! advances, then writes the `verdict`.
//!
//! Build:   `spacetime build`
//! Publish: `spacetime publish scenario-engine`
//!
//! Reducers are transactional, which is what makes `claim_run` a safe atomic
//! claim with no extra locking (see below).

use spacetimedb::{reducer, table, Identity, ReducerContext, SpacetimeType, Table, Timestamp};

// ============================================================================
// Enums (stored via #[derive(SpacetimeType)])
// ============================================================================

/// Cost/size tier for a run. Drives agent count, rounds, and model mix.
#[derive(SpacetimeType, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BudgetTier {
    Quick,    // dozens of agents, small model — cents
    Standard, // hundreds, small crowd + smart summary — ~$3
    Deep,     // thousands, bigger crowd + smart summary — ~$18
}

/// Lifecycle of a run: queued → claimed → building_graph → simulating →
/// summarizing → done | failed.
#[derive(SpacetimeType, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RunStatus {
    Queued,
    Claimed,
    BuildingGraph,
    Simulating,
    Summarizing,
    Done,
    Failed,
}

/// A node's stance at one step of the replay. This is what colours the canvas.
#[derive(SpacetimeType, Clone, Copy, PartialEq, Eq, Debug)]
pub enum NodeState {
    Seed,    // where the problem entered
    Pro,     // moved / adopted
    Amplify, // actively spreading it
    Neutral, // reached but didn't move
    Stall,   // resisted / killed it
    Idle,    // not reached yet
}

// ============================================================================
// Tables
// ============================================================================

/// A decision to war-game: "how does <audience> react to <description>?"
#[table(name = scenario, public)]
pub struct Scenario {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub owner: Identity,
    pub description: String,
    pub audience: String,
    pub created_at: Timestamp,
}

/// A zoomed-out "region" bubble on the canvas (e.g. "crypto twitter").
#[table(name = community, public,
    index(name = by_scenario, btree(columns = [scenario_id])))]
pub struct Community {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scenario_id: u64,
    pub label: String,
    pub lean: String,
    pub size: u32, // rough population weight
    pub tier: u8,  // 1 = opinion-shapers, 2 = amplifiers, 3 = crowd
}

/// A single shaper inside a community — the zoomed-in individual node.
#[table(name = persona, public,
    index(name = by_scenario, btree(columns = [scenario_id])),
    index(name = by_community, btree(columns = [community_id])))]
pub struct Persona {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scenario_id: u64,
    pub community_id: u64,
    pub role: String,     // "tech journalist"
    pub lean: String,     // "progressive"
    pub platform: String, // "X + newsletter"
    pub reach: u8,        // 0..5, sets contagion weight
    pub tone: String,     // "skeptical"
}

/// A directed influence link between two personas.
#[table(name = edge, public,
    index(name = by_scenario, btree(columns = [scenario_id])))]
pub struct Edge {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scenario_id: u64,
    pub from_persona: u64,
    pub to_persona: u64,
    pub weight: f32,
}

/// Cached GraphRAG for a scenario so we don't rebuild the world every run.
/// One row per scenario (scenario_id is the primary key).
#[table(name = persona_graph, public)]
pub struct PersonaGraph {
    #[primary_key]
    pub scenario_id: u64,
    pub graph_json: String,
    pub model: String,
    pub cached_at: Timestamp,
}

/// One simulation run. The worker drives `status`/`progress`; the UI watches.
#[table(name = run, public,
    index(name = by_scenario, btree(columns = [scenario_id])))]
pub struct Run {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scenario_id: u64,
    pub tier: BudgetTier,
    pub status: RunStatus,
    pub progress: f32,       // 0.0 .. 1.0
    pub cost_estimate: f32,  // computed up front; enforced as a hard cap off-DB
    pub worker: Option<Identity>,
    pub started_at: Timestamp,
    pub finished_at: Option<Timestamp>,
}

/// One node's state at one step — the per-step timeline that powers the
/// scrubber. `node_ref` is "community:<id>" or "persona:<id>".
#[table(name = frame, public,
    index(name = by_run, btree(columns = [run_id])))]
pub struct Frame {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub run_id: u64,
    pub step: u32,
    pub node_ref: String,
    pub state: NodeState,
    pub said: String, // the utterance captured at this step (may be empty)
}

/// The final answer for a run. One row per run.
#[table(name = verdict, public)]
pub struct Verdict {
    #[primary_key]
    pub run_id: u64,
    pub outcome: String,      // "Spreads — within tech, stalls beyond"
    pub confidence: f32,      // 0.0 .. 1.0
    pub summary: String,
    pub cascade_json: String, // summarized who-moved-whom
    pub raw_json: String,     // full MiroFish verdict.json
    pub finished_at: Timestamp,
}

/// Who is watching a scenario (for shared/live viewing).
#[table(name = subscriber, public,
    index(name = by_scenario, btree(columns = [scenario_id])))]
pub struct Subscriber {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scenario_id: u64,
    pub user: Identity,
}

/// Batched frame payload so the worker writes a whole round in one reducer call.
#[derive(SpacetimeType)]
pub struct FrameInput {
    pub step: u32,
    pub node_ref: String,
    pub state: NodeState,
    pub said: String,
}

// ============================================================================
// Reducers — authoring the world (called by the UI / an MCP agent)
// ============================================================================

/// Reducers can't return a value to the caller; the client learns the new row's
/// id via its subscription to `scenario`.
#[reducer]
pub fn create_scenario(ctx: &ReducerContext, description: String, audience: String) {
    ctx.db.scenario().insert(Scenario {
        id: 0,
        owner: ctx.sender,
        description,
        audience,
        created_at: ctx.timestamp,
    });
}

#[reducer]
pub fn add_community(
    ctx: &ReducerContext,
    scenario_id: u64,
    label: String,
    lean: String,
    size: u32,
    tier: u8,
) -> Result<(), String> {
    if ctx.db.scenario().id().find(scenario_id).is_none() {
        return Err("scenario not found".into());
    }
    ctx.db.community().insert(Community { id: 0, scenario_id, label, lean, size, tier });
    Ok(())
}

#[reducer]
pub fn add_persona(
    ctx: &ReducerContext,
    scenario_id: u64,
    community_id: u64,
    role: String,
    lean: String,
    platform: String,
    reach: u8,
    tone: String,
) -> Result<(), String> {
    if ctx.db.scenario().id().find(scenario_id).is_none() {
        return Err("scenario not found".into());
    }
    ctx.db.persona().insert(Persona {
        id: 0,
        scenario_id,
        community_id,
        role,
        lean,
        platform,
        reach,
        tone,
    });
    Ok(())
}

#[reducer]
pub fn add_edge(
    ctx: &ReducerContext,
    scenario_id: u64,
    from_persona: u64,
    to_persona: u64,
    weight: f32,
) -> Result<(), String> {
    if ctx.db.scenario().id().find(scenario_id).is_none() {
        return Err("scenario not found".into());
    }
    ctx.db.edge().insert(Edge { id: 0, scenario_id, from_persona, to_persona, weight });
    Ok(())
}

/// Who's watching (dedup left to the UI; a composite unique index could enforce
/// it at the DB level later).
#[reducer]
pub fn subscribe_scenario(ctx: &ReducerContext, scenario_id: u64) {
    ctx.db.subscriber().insert(Subscriber { id: 0, scenario_id, user: ctx.sender });
}

// ============================================================================
// Reducers — the run pipeline (UI submits, worker drives)
// ============================================================================

/// UI/agent submits a run. Returns immediately with status Queued; a worker
/// picks it up. `cost_estimate` is computed up front and shown before Run.
#[reducer]
pub fn submit_run(
    ctx: &ReducerContext,
    scenario_id: u64,
    tier: BudgetTier,
    cost_estimate: f32,
) -> Result<(), String> {
    if ctx.db.scenario().id().find(scenario_id).is_none() {
        return Err("scenario not found".into());
    }
    ctx.db.run().insert(Run {
        id: 0,
        scenario_id,
        tier,
        status: RunStatus::Queued,
        progress: 0.0,
        cost_estimate,
        worker: None,
        started_at: ctx.timestamp,
        finished_at: None,
    });
    Ok(())
}

/// Atomic claim. Because reducers are transactional, two workers racing to
/// claim the same run serialize: the first commits the Queued→Claimed flip, the
/// second re-reads a non-Queued row and gets an error. No extra locking needed.
#[reducer]
pub fn claim_run(ctx: &ReducerContext, run_id: u64) -> Result<(), String> {
    let mut run = ctx.db.run().id().find(run_id).ok_or("run not found")?;
    if run.status != RunStatus::Queued {
        return Err("run already claimed".into());
    }
    run.status = RunStatus::Claimed;
    run.worker = Some(ctx.sender);
    ctx.db.run().id().update(run);
    Ok(())
}

/// Worker pushes lifecycle + progress. Stamps `finished_at` on terminal states.
#[reducer]
pub fn bump_status(
    ctx: &ReducerContext,
    run_id: u64,
    status: RunStatus,
    progress: f32,
) -> Result<(), String> {
    let mut run = ctx.db.run().id().find(run_id).ok_or("run not found")?;
    run.status = status;
    run.progress = progress.clamp(0.0, 1.0);
    if matches!(status, RunStatus::Done | RunStatus::Failed) {
        run.finished_at = Some(ctx.timestamp);
    }
    ctx.db.run().id().update(run);
    Ok(())
}

/// Worker writes a whole round of frames in one call — this is the stream the
/// canvas scrubber animates from.
#[reducer]
pub fn record_frames(
    ctx: &ReducerContext,
    run_id: u64,
    frames: Vec<FrameInput>,
) -> Result<(), String> {
    if ctx.db.run().id().find(run_id).is_none() {
        return Err("run not found".into());
    }
    for f in frames {
        ctx.db.frame().insert(Frame {
            id: 0,
            run_id,
            step: f.step,
            node_ref: f.node_ref,
            state: f.state,
            said: f.said,
        });
    }
    Ok(())
}

/// Worker writes the final verdict (upsert on run_id).
#[reducer]
pub fn record_verdict(
    ctx: &ReducerContext,
    run_id: u64,
    outcome: String,
    confidence: f32,
    summary: String,
    cascade_json: String,
    raw_json: String,
) -> Result<(), String> {
    if ctx.db.run().id().find(run_id).is_none() {
        return Err("run not found".into());
    }
    let row = Verdict {
        run_id,
        outcome,
        confidence: confidence.clamp(0.0, 1.0),
        summary,
        cascade_json,
        raw_json,
        finished_at: ctx.timestamp,
    };
    if ctx.db.verdict().run_id().find(run_id).is_some() {
        ctx.db.verdict().run_id().update(row);
    } else {
        ctx.db.verdict().insert(row);
    }
    Ok(())
}

/// Reuse the built GraphRAG across runs (upsert on scenario_id).
#[reducer]
pub fn cache_persona_graph(
    ctx: &ReducerContext,
    scenario_id: u64,
    graph_json: String,
    model: String,
) -> Result<(), String> {
    if ctx.db.scenario().id().find(scenario_id).is_none() {
        return Err("scenario not found".into());
    }
    let row = PersonaGraph { scenario_id, graph_json, model, cached_at: ctx.timestamp };
    if ctx.db.persona_graph().scenario_id().find(scenario_id).is_some() {
        ctx.db.persona_graph().scenario_id().update(row);
    } else {
        ctx.db.persona_graph().insert(row);
    }
    Ok(())
}
