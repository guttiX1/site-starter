import type { Metadata } from "next";
import Link from "next/link";
import "./landing.css";

export const metadata: Metadata = {
  title: "Scenario Engine — run the play before you commit",
  description:
    "Point it at a decision and simulate how the crowd, the market, or the voters react — before you actually do the thing. The war-gaming tool hedge funds use, for everyone.",
};

const AUDIENCES = [
  { c: "var(--pro)", who: "Traders", q: "How does the crowd react if this drops?" },
  { c: "var(--accent)", who: "Campaigns", q: "How do voters respond before I spend the budget?" },
  { c: "var(--amplify)", who: "Crypto", q: "Does this pump or panic the holders?" },
  { c: "var(--neutral)", who: "Anyone", q: "Run it in a sandbox before I commit for real." },
];

const STEPS = [
  { n: "01", h: "Build the influence graph", p: "Drop in the people and communities that shape opinion — a tech journalist, a big account, a voting bloc. Connect who influences whom and pick where the idea starts." },
  { n: "02", h: "Run the simulation", p: "The engine populates each node with agents that actually reason about your scenario, then lets the reaction spread along the connections you drew." },
  { n: "03", h: "Read the cascade", p: "Watch camps form step by step — who moved, who amplified, who ignored it, where it stalled. Scrub the timeline to see exactly how the outcome was made." },
];

export default function Home() {
  return (
    <div className="lp">
      <div className="wrap">
        <nav>
          <div className="brand"><span className="dot" />Scenario Engine</div>
          <Link href="/engine" className="nav-cta">Open the engine →</Link>
        </nav>

        <header className="hero">
          <div>
            <div className="eyebrow">Predictive simulation · for everyone</div>
            <h1>Run the play <em>before</em> you commit.</h1>
            <p className="lede">
              Point it at a decision and simulate how the crowd, the market, or the
              voters react — <em>before</em> you actually do the thing. The war-gaming
              the pros pay a quant desk for, cheap enough for anyone.
            </p>
            <div className="cta-row">
              <Link href="/engine" className="btn primary">Try the engine →</Link>
              <a href="#how" className="btn ghost">See how it works</a>
            </div>
          </div>
          <div className="art" aria-hidden="true">
            <svg viewBox="0 0 420 300">
              {/* edges */}
              <path d="M120 90 L250 70" stroke="var(--amplify)" strokeWidth="3" fill="none" />
              <path d="M120 90 L110 200" stroke="var(--pro)" strokeWidth="3" fill="none" />
              <path d="M250 70 L330 160" stroke="var(--border-2)" strokeWidth="2" strokeDasharray="5 4" fill="none" />
              <path d="M110 200 L260 240" stroke="var(--stall)" strokeWidth="2.5" strokeDasharray="5 4" fill="none" />
              {/* seed */}
              <circle cx="120" cy="90" r="34" fill="color-mix(in srgb, var(--seed) 16%, transparent)" stroke="var(--seed)" strokeWidth="2.5" />
              <text className="lbl" x="120" y="46" textAnchor="middle">Tech press</text>
              <text className="sub" x="120" y="94" textAnchor="middle" fill="var(--seed)">✸ seed</text>
              {/* amplify */}
              <circle cx="250" cy="70" r="30" fill="color-mix(in srgb, var(--amplify) 18%, transparent)" stroke="var(--amplify)" strokeWidth="2.5" />
              <text className="lbl" x="250" y="26" textAnchor="middle">Crypto</text>
              {/* pro */}
              <circle cx="110" cy="200" r="30" fill="color-mix(in srgb, var(--pro) 16%, transparent)" stroke="var(--pro)" strokeWidth="2.5" />
              <text className="lbl" x="110" y="250" textAnchor="middle">VC</text>
              {/* stall */}
              <circle cx="270" cy="240" r="26" fill="color-mix(in srgb, var(--stall) 15%, transparent)" stroke="var(--stall)" strokeWidth="2" />
              <text className="sub" x="270" y="244" textAnchor="middle" fill="var(--stall)">stalled</text>
              {/* neutral */}
              <circle cx="340" cy="165" r="26" fill="color-mix(in srgb, var(--neutral) 15%, transparent)" stroke="var(--neutral)" strokeWidth="2" />
              <text className="sub" x="340" y="169" textAnchor="middle" fill="var(--neutral)">no move</text>
            </svg>
          </div>
        </header>
      </div>

      <div className="wrap">
        <section>
          <div className="kicker">One engine, any decision</div>
          <h2>Same machine. Different question.</h2>
          <p className="sec-lede">
            A trader points it at a ticker. A campaign points it at a message. A crypto
            trader points it at a token. It’s all one thing: run the scenario, see who
            reacts, decide with eyes open.
          </p>
          <div className="grid cols-4">
            {AUDIENCES.map((a) => (
              <div className="card" key={a.who}>
                <h3><span className="who" style={{ background: a.c }} />{a.who}</h3>
                <p>{a.q}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how">
          <div className="kicker">How it works</div>
          <h2>You build the map. It shows you the reaction.</h2>
          <div className="grid cols-3" style={{ marginTop: 24 }}>
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <span className="n">{s.n}</span>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="kicker">Why it’s different</div>
          <h2>A glass box, not a black box.</h2>
          <div className="diff" style={{ marginTop: 20 }}>
            <div className="card">
              <h3>You see how it forms</h3>
              <p>It doesn’t just hand you a number. Replay the whole cascade node by
                node — who moved first, which link tipped it, where it died. You can
                actually reason about the answer.</p>
            </div>
            <div className="card">
              <h3>Cheap enough to actually use</h3>
              <p>Run once, store the world, share the result. Small models for the
                crowd, a smart one for the summary. The infrastructure that costs a
                fortune elsewhere is the part we made nearly free.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="final">
        <div className="wrap">
          <h2>Stop guessing how people will react.</h2>
          <p>Build a scenario, hit run, and watch it play out — in about a minute.</p>
          <Link href="/engine" className="btn primary">Open the engine →</Link>
        </div>
      </div>

      <div className="wrap">
        <p className="disclaimer">
          A simulation is a thinking tool, not a crystal ball — it models how a
          reaction <em>could</em> spread so you can pressure-test a decision, not
          predict the future with certainty.
        </p>
        <footer>
          <span>Scenario Engine</span>
          <span>Built on SpacetimeDB · MiroFish · MCP</span>
        </footer>
      </div>
    </div>
  );
}
