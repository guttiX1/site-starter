"use client";

import { useEffect, useRef } from "react";
import "./engine.css";
import {
  communities, edges, profiles, individuals, STEP_NAMES, TOTAL_STEPS,
  StubEngine, type Engine, type Frame, type NodeState, type BudgetTier,
  type RunState, type Verdict,
} from "./engine";

const SVGNS = "http://www.w3.org/2000/svg";
// "build" is a UI-only visual state (all nodes tinted with the accent in Build
// mode); the real simulation states come from NodeState in the engine contract.
type VisualState = NodeState | "build";
type Attrs = Record<string, string | number>;
function el<T extends Element>(tag: string, attrs: Attrs): T {
  const e = document.createElementNS(SVGNS, tag) as unknown as T;
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}
const cById = (id: string) => communities.find((c) => c.id === id);

const APP_HTML = `
<div class="stage"><div class="app">
  <div class="topbar">
    <div class="brand"><span class="dot"></span>Scenario Engine</div>
    <div class="scenario">▸ <b>“How does tech twitter react to our launch?”</b></div>
    <div class="modeswitch" data-el="modeswitch">
      <button data-mode="build" class="on">Build</button>
      <button data-mode="replay">Replay</button>
    </div>
    <div class="budget">Budget
      <select data-el="budget">
        <option value="quick">quick · ~$0.40</option>
        <option value="standard">standard · ~$3</option>
        <option value="deep">deep · ~$18</option>
      </select>
    </div>
    <button class="run" data-el="run"><span class="tri"></span>Run sim</button>
  </div>
  <div class="body">
    <div class="rail" data-el="leftRail"></div>
    <div class="canvas-wrap">
      <div class="canvas-top"><span class="tag" data-el="canvasTag">Zoomed out · communities</span></div>
      <svg class="graph" data-el="graph" viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet"></svg>
      <div class="legend">
        <span><b style="background:var(--pro)"></b>moved</span>
        <span><b style="background:var(--amplify)"></b>amplifying</span>
        <span><b style="background:var(--neutral)"></b>no move</span>
        <span><b style="background:var(--stall)"></b>stalled</span>
        <span><b style="background:var(--seed)"></b>seed</span>
      </div>
    </div>
    <div class="rail right"><div class="rail-pad" data-el="inspector"></div></div>
  </div>
  <div class="scrubber" data-el="scrubber">
    <button class="play" data-el="play"><span class="tri"></span></button>
    <div class="track">
      <div class="track-labels" data-el="trackLabels"></div>
      <input type="range" data-el="range" min="0" max="${TOTAL_STEPS}" value="0" step="1">
    </div>
    <div class="stepread" data-el="stepread">t0 · seed</div>
  </div>
</div>
<div class="foot"><b>M0 · live spine</b> — the cascade streams from the engine client (a stub of the SpacetimeDB contract), not scripted in the view. Hit <b>Run sim</b>.</div>
</div>`;

export default function EngineCanvas() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const root: HTMLDivElement = rootRef.current; // effect runs post-mount; ref is set
    root.innerHTML = APP_HTML;
    const engine: Engine = new StubEngine();

    const q = <T extends Element>(name: string) =>
      root.querySelector(`[data-el="${name}"]`) as T;
    const graph = q<SVGSVGElement>("graph");

    const S = {
      mode: "build" as "build" | "replay",
      step: 0,
      sel: "press",
      zoom: null as string | null,
      playing: false,
      tier: "quick" as BudgetTier,
      run: null as RunState | null,
      verdict: null as Verdict | null,
      follow: true,
      maxStep: 0,
    };
    // per-step community state, filled as frames stream in
    const framesByStep = new Map<number, Map<string, NodeState>>();
    let playTimer: ReturnType<typeof setInterval> | null = null;
    let activeRun: { cancel: () => void } | null = null;

    const communityState = (id: string): VisualState => {
      if (S.mode === "build") return "build";
      const m = framesByStep.get(S.step);
      return (m && m.get(id)) || "idle";
    };
    const individualState = (parent: string, hold?: boolean): VisualState => {
      if (S.mode === "build") return "build";
      const ps = communityState(parent);
      if (ps === "idle") return "idle";
      if (hold) return S.step >= TOTAL_STEPS ? ps : "neutral";
      return ps;
    };

    // ---------- graph ----------
    function renderGraph() {
      while (graph.firstChild) graph.removeChild(graph.firstChild);
      if (S.zoom) return renderIndividuals(S.zoom);
      edges.forEach((e) => {
        const a = cById(e.a)!, b = cById(e.b)!;
        graph.appendChild(el("path", { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, class: "edge", "data-a": e.a, "data-b": e.b }));
      });
      communities.forEach((c) => {
        const g = el<SVGGElement>("g", { class: `node state-${communityState(c.id)}${c.id === S.sel ? " sel" : ""}`, "data-id": c.id });
        g.appendChild(el("circle", { class: "ring", cx: c.x, cy: c.y, r: c.r + 8 }));
        g.appendChild(el("circle", { class: "bubble", cx: c.x, cy: c.y, r: c.r }));
        const n = (individuals[c.id] || []).length;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          g.appendChild(el("circle", { class: "satt", cx: c.x + Math.cos(ang) * (c.r * 0.5), cy: c.y + Math.sin(ang) * (c.r * 0.5), r: 3 }));
        }
        const t1 = el("text", { class: "lbl", x: c.x, y: c.y - c.r - 14 }); t1.textContent = c.label; g.appendChild(t1);
        const t2 = el("text", { class: "sub", x: c.x, y: c.y - c.r - 2 }); t2.textContent = c.sub; g.appendChild(t2);
        graph.appendChild(g);
      });
      updateEdges();
    }
    function renderIndividuals(pid: string) {
      const parent = cById(pid)!, people = individuals[pid] || [];
      const cx = 480, cy = 280, R = 170;
      people.forEach((p, i) => {
        const ang = (i / people.length) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(ang) * R, py = cy + Math.sin(ang) * R;
        graph.appendChild(el("path", { d: `M${cx} ${cy} L${px} ${py}`, class: "edge" }));
        const st = individualState(pid, p.hold);
        const g = el<SVGGElement>("g", { class: `node state-${st}`, "data-id": `${pid}:${i}` });
        g.appendChild(el("circle", { class: "ring", cx: px, cy: py, r: 32 }));
        g.appendChild(el("circle", { class: "bubble", cx: px, cy: py, r: 24 }));
        const tl = el("text", { class: "lbl", x: px, y: py + 42 }); tl.textContent = p.label; g.appendChild(tl);
        graph.appendChild(g);
      });
      const hub = el<SVGGElement>("g", { class: `node state-${communityState(pid)}`, "data-id": pid });
      hub.appendChild(el("circle", { class: "bubble", cx: cx, cy: cy, r: 34 }));
      const ht = el("text", { class: "sub", x: cx, y: cy + 3 }); ht.textContent = parent.label; hub.appendChild(ht);
      graph.appendChild(hub);
    }
    function updateEdges() {
      if (S.zoom) return;
      graph.querySelectorAll(".edge").forEach((line) => {
        const a = line.getAttribute("data-a"), b = line.getAttribute("data-b");
        if (!a || !b) return;
        const sa = communityState(a), sb = communityState(b);
        const active = S.mode === "replay" && sa !== "idle" && sb !== "idle" && sa !== "build";
        line.classList.toggle("active", active);
      });
    }
    function refreshStates() {
      graph.querySelectorAll<SVGGElement>(".node").forEach((g) => {
        const id = g.getAttribute("data-id")!;
        let st: VisualState;
        if (id.includes(":")) {
          const [pr, idx] = id.split(":");
          st = individualState(pr, (individuals[pr][+idx] || {}).hold);
        } else st = communityState(id);
        g.setAttribute("class", `node state-${st}${id === S.sel ? " sel" : ""}`);
      });
      updateEdges();
    }

    // ---------- rails ----------
    function reachBars(n: number) {
      let s = ""; for (let i = 0; i < 5; i++) s += `<i class="${i < n ? "on" : ""}"></i>`;
      return `<span class="reach">${s}</span>`;
    }
    function renderLeftRail() {
      const r = q<HTMLDivElement>("leftRail");
      if (S.mode === "build") {
        const comm = communities.map((c) => `<div class="chip" data-pick="${c.id}"><span class="swatch"></span>${c.label}</div>`).join("");
        r.innerHTML = `<div class="rail-pad"><p class="eyebrow">Library</p>
          <p class="hint">Pick who to simulate, then hit Run.</p>
          <div class="group-label">Communities · regions</div>${comm}</div>`;
      } else {
        const st = S.run?.status ?? "queued";
        const pct = Math.round((S.run?.progress ?? 0) * 100);
        const statusCard = `<div class="status-card">
          <div class="status-row"><span class="k">run</span><span class="v">#${S.run?.runId ?? "—"}</span></div>
          <div class="status-row" style="margin-top:6px"><span class="k">status</span><span class="status-pill">${st}</span></div>
          <div class="prog"><i style="width:${pct}%"></i></div></div>`;
        const verdict = S.verdict ? `
          <p class="eyebrow">Verdict</p>
          <div class="verdict-card"><div class="verdict-head">
            <div class="verdict-out">${S.verdict.outcome.split("—")[0]}<span style="color:var(--pro)">✓</span></div>
            <div class="verdict-sub">${S.verdict.outcome.split("—")[1] ?? ""}</div></div>
            <div class="conf"><div class="conf-label"><span>Confidence</span><span>${Math.round(S.verdict.confidence * 100)}%</span></div>
            <div class="conf-bar"><i style="width:${Math.round(S.verdict.confidence * 100)}%"></i></div></div></div>
          <p class="eyebrow">Who moved whom</p>
          <ul class="flow">${S.verdict.cascade.map((c) => `<li class="${c.kind}">${c.text}</li>`).join("")}</ul>`
          : `<div class="empty">Simulating… frames are streaming into the canvas.</div>`;
        r.innerHTML = `<div class="rail-pad">${statusCard}${verdict}</div>`;
      }
    }
    function renderInspector() {
      const box = q<HTMLDivElement>("inspector");
      const id = S.sel, isPerson = id.includes(":");
      const baseId = isPerson ? id.split(":")[0] : id;
      const p = profiles[baseId] || profiles.press;
      const label = isPerson ? individuals[baseId][+id.split(":")[1]].label : cById(baseId)!.label;
      const st = isPerson ? individualState(baseId, individuals[baseId][+id.split(":")[1]].hold) : communityState(baseId);
      const cvar = `--c:var(--${st === "build" ? "accent" : st})`;
      const zoomBtn = !isPerson && individuals[baseId]
        ? `<button class="chip" data-el="zoombtn" style="justify-content:center;margin-top:12px">⊕ Zoom into ${individuals[baseId].length} individuals</button>` : "";
      if (S.mode === "build") {
        box.innerHTML = `<div style="${cvar}">
          <div class="insp-title"><span class="dotc"></span>${label}</div>
          <div class="insp-tag">Profile · archetype</div>
          <div class="field"><label>Role</label><div class="val">${p.role}</div></div>
          <div class="field"><label>Lean</label><div class="val">${p.lean}</div></div>
          <div class="field"><label>Platform</label><div class="val">${p.platform}</div></div>
          <div class="field"><label>Reach</label><div class="val">${reachBars(p.reach)}</div></div>
          <div class="field"><label>Tone</label><div class="val">${p.tone}</div></div>${zoomBtn}</div>`;
      } else {
        const stanceLabel: Record<string, string> = { seed: "origin", pro: "PRO", amplify: "AMPLIFY", neutral: "no move", stall: "STALLED", idle: "not reached" };
        box.innerHTML = `<div style="${cvar}">
          <div class="insp-title"><span class="dotc"></span>${label}</div>
          <div class="insp-tag">State @ step t${S.step}</div>
          <div class="field"><label>Stance</label><div><span class="pill">${stanceLabel[st] || st}</span></div></div>
          <div class="field"><label>Trajectory</label><div class="val">${p.flip}</div></div>
          <div class="field"><label>Tipped by</label><div class="val">${p.tip}</div></div>
          <div class="field"><label>Said</label><div class="said">“${p.said}”</div></div>${zoomBtn}</div>`;
      }
      const zb = box.querySelector('[data-el="zoombtn"]') as HTMLElement | null;
      if (zb) zb.onclick = () => setZoom(baseId);
    }

    // ---------- scrubber ----------
    function renderTrackLabels() {
      const wrap = q<HTMLDivElement>("trackLabels");
      let s = "";
      for (let i = 0; i <= TOTAL_STEPS; i++) s += `<span class="${i === S.step ? "now" : ""}">${STEP_NAMES[i] ? "t" + i : "·"}</span>`;
      wrap.innerHTML = s;
    }
    function setStep(n: number) {
      S.step = Math.max(0, Math.min(TOTAL_STEPS, n));
      const range = q<HTMLInputElement>("range");
      range.value = String(S.step);
      range.style.setProperty("--pct", (S.step / TOTAL_STEPS) * 100 + "%");
      q<HTMLDivElement>("stepread").textContent = `t${S.step}${STEP_NAMES[S.step] ? " · " + STEP_NAMES[S.step] : ""}`;
      renderTrackLabels(); refreshStates(); renderInspector();
    }

    // ---------- modes / zoom / play ----------
    function setMode(m: "build" | "replay") {
      S.mode = m; S.playing = false; stopPlay(); setPlayIcon();
      root.querySelectorAll('[data-el="modeswitch"] button').forEach((b) =>
        b.classList.toggle("on", b.getAttribute("data-mode") === m));
      q<HTMLDivElement>("scrubber").classList.toggle("show", m === "replay");
      renderLeftRail(); renderGraph(); refreshStates(); renderInspector();
      if (m === "replay") setStep(S.step);
    }
    function setZoom(id: string) {
      S.zoom = id; S.sel = id;
      q<HTMLDivElement>("canvasTag").textContent = `Zoomed in · ${cById(id)!.label} · individuals`;
      renderGraph(); refreshStates(); renderInspector();
    }
    function clearZoom() {
      S.zoom = null;
      q<HTMLDivElement>("canvasTag").textContent = "Zoomed out · communities";
      renderGraph(); refreshStates(); renderInspector();
    }
    function setPlayIcon() {
      q<HTMLButtonElement>("play").innerHTML = S.playing
        ? '<span class="pause"><span></span><span></span></span>' : '<span class="tri"></span>';
    }
    function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } }
    function play() {
      if (S.mode !== "replay") setMode("replay");
      if (S.playing) { S.playing = false; stopPlay(); setPlayIcon(); return; }
      if (S.step >= S.maxStep) setStep(0);
      S.playing = true; setPlayIcon();
      playTimer = setInterval(() => {
        if (S.step >= S.maxStep) { S.playing = false; stopPlay(); setPlayIcon(); return; }
        setStep(S.step + 1);
      }, 850);
    }

    // ---------- the run: consume the engine's streamed subscription ----------
    function startRun() {
      if (activeRun) activeRun.cancel();
      framesByStep.clear(); S.maxStep = 0; S.step = 0; S.verdict = null; S.follow = true;
      setMode("replay");
      const run = engine.runSimulation(
        S.tier,
        (s) => { S.run = s; renderLeftRail(); },
        (frames: Frame[]) => {
          frames.forEach((f) => {
            const step = f.step;
            if (!framesByStep.has(step)) framesByStep.set(step, new Map());
            framesByStep.get(step)!.set(f.node_ref.replace("community:", ""), f.state);
            if (step > S.maxStep) S.maxStep = step;
          });
          q<HTMLInputElement>("range").max = String(TOTAL_STEPS);
          if (S.follow) setStep(S.maxStep); else refreshStates();
        },
        (v) => { S.verdict = v; renderLeftRail(); },
      );
      activeRun = run;
      q<HTMLButtonElement>("run").disabled = true;
      // re-enable when done
      const check = setInterval(() => {
        if (S.run?.status === "done" || S.run?.status === "failed") {
          q<HTMLButtonElement>("run").disabled = false; clearInterval(check);
        }
      }, 300);
    }

    // ---------- events ----------
    graph.addEventListener("click", (e) => {
      const g = (e.target as Element).closest(".node");
      if (!g) return;
      S.sel = g.getAttribute("data-id")!;
      refreshStates(); renderInspector();
    });
    root.querySelectorAll('[data-el="modeswitch"] button').forEach((b) => {
      (b as HTMLButtonElement).onclick = () => setMode(b.getAttribute("data-mode") as "build" | "replay");
    });
    q<HTMLButtonElement>("run").onclick = startRun;
    q<HTMLButtonElement>("play").onclick = play;
    q<HTMLSelectElement>("budget").onchange = (e) => { S.tier = (e.target as HTMLSelectElement).value as BudgetTier; };
    const range = q<HTMLInputElement>("range");
    range.oninput = () => { S.playing = false; stopPlay(); setPlayIcon(); S.follow = false; setStep(+range.value); };
    q<HTMLDivElement>("leftRail").addEventListener("click", (e) => {
      const c = (e.target as Element).closest("[data-pick]");
      if (!c) return;
      if (S.zoom) clearZoom();
      S.sel = c.getAttribute("data-pick")!;
      refreshStates(); renderInspector();
    });
    q<HTMLDivElement>("canvasTag").addEventListener("click", () => { if (S.zoom) clearZoom(); });

    // init
    renderLeftRail(); renderGraph(); renderInspector(); renderTrackLabels();

    return () => {
      if (activeRun) activeRun.cancel();
      stopPlay();
      root.innerHTML = "";
    };
  }, []);

  return <div ref={rootRef} className="se-root" />;
}
