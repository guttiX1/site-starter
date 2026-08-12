# Setup — running the Scenario Engine on your computer

A step-by-step, copy-paste guide. Do the stages in order; each one is safe to
stop at. Stage 1 costs nothing and proves the app. Stage 3 is the real predictor.

There are three moving parts:
- **the web app** (the canvas you click)
- **SpacetimeDB** (the shared state)
- **the worker** (runs the simulation)

You need: a terminal, **Node 18+**, **Python 3.11+**. That's it to start.

---

## Stage 1 — Just the app (5 min, $0, no database)

This runs the front end with the built-in stub. Good first sanity check.

```bash
npm install
npm run dev
```
Open **http://localhost:3000/engine**.

**You should see:** the canvas. Click a node → edit it on the right. Hit **Run
sim** → the cascade animates, a verdict appears, the scrubber fills in. Move the
seed to a different node, run again → the outcome changes.

If that works, the whole front end is proven. Stop here anytime.

---

## Stage 2 — Real database, still no LLM spend (~15 min, $0)

Now the app and a real worker talk through SpacetimeDB — with the heuristic, so
still no LLM cost. This proves the *plumbing*.

**2a. Install + start SpacetimeDB** (in its own terminal)
```bash
# install once — see https://spacetimedb.com/install
spacetime start
```
Leave it running.

**2b. Publish the module** (new terminal, from the repo root)
```bash
cd spacetime
spacetime build
spacetime publish scenario-engine
```
**You should see:** a "published" confirmation with the module name.

**2c. Start the worker** (new terminal)
```bash
cd spacetime/worker
cp .env.example .env          # defaults are fine for this stage (USE_MIROFISH=0)
pip install -r requirements.txt
python worker.py
```
**You should see:** `[worker] watching … for queued runs`.

**2d. Point the app at the database.** In the repo root, create `.env.local`:
```bash
echo "NEXT_PUBLIC_SPACETIME_URI=http://localhost:3000" > .env.local
echo "NEXT_PUBLIC_SPACETIME_MODULE=scenario-engine"   >> .env.local
```
(This is the flag the `makeEngine()` factory reads to use the real engine. If the
app isn't wired to it yet, ping me — it's a two-line change in `app/engine/page.tsx`.)

**You should see:** hit Run in the app, and the worker terminal prints
`claiming run … done`, while the canvas animates from the **database**, not the
stub. Same picture as Stage 1 — but now it's real end to end.

---

## Stage 3 — The real predictor (MiroFish)

Swap the heuristic for actual LLM-driven agents.

**3a. Install the MiroFish CLI**
```bash
# the headless fork the worker drives:
# https://github.com/amadad/mirofish-cli  → follow its install so `mirofish` is on PATH
mirofish --help        # confirm it runs
```

**3b. Pick your LLM route** — edit `spacetime/worker/.env`:

- **Route A — free, uses your Claude Code:**
  ```
  USE_MIROFISH=1
  LLM_PROVIDER=claude-cli
  ```
- **Route B — paid key (OpenAI / Groq / OpenRouter):**
  ```
  USE_MIROFISH=1
  LLM_API_KEY=sk-...            # your key — never commit this
  LLM_BASE_URL=https://api.openai.com/v1
  LLM_MODEL_NAME=gpt-4o-mini
  ```

**3c. Restart the worker** (`Ctrl-C`, then `python worker.py` again).

**You should see:** on the next Run, the worker prints `running MiroFish …`, takes
a few minutes, then writes a real verdict. Start with the **quick** budget tier.

> First real run: MiroFish's `timeline.json` / `verdict.json` field names aren't
> publicly documented, so the parsers are defensive and fall back to the heuristic
> if they don't match. If the verdict looks generic, send me one real
> `uploads/runs/<id>/report/verdict.json` + `simulation/timeline.json` and I'll
> tighten the mapping exactly.

---

## If something breaks

| Symptom | Fix |
|---|---|
| `spacetime: command not found` | Install the CLI (spacetimedb.com/install), reopen terminal |
| Worker: `poll error` / connection refused | Is `spacetime start` running? Is the URI in `.env` right? |
| HTTP 404 on reducer calls | Your SpacetimeDB version uses a different API path — tell me the version, it's a one-line change in `worker.py` (`API =`) |
| `mirofish: command not found` | mirofish-cli isn't installed / not on PATH |
| Run stuck on `simulating` | Check the worker terminal for a traceback; failures set the run to `failed` |

## Costs
- Stages 1–2: **$0.**
- Stage 3 Route A (claude-cli): uses your existing Claude Code — **no separate bill.**
- Stage 3 Route B: a `quick` run on `gpt-4o-mini` is **cents**; the worker's
  per-tier rounds cap stops it running away.
