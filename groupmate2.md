# Groupmate 2 — Benchmark & Dashboard Owner

**Role:** A11y-Bench + detection metrics + dashboard  
**Owns:** `packages/bench`, `packages/scoring`, `apps/dashboard`  
**Coordinates on:** `packages/shared` (types/schema — announce before editing)

Your job is to **prove Ramp’s detection quality** with real data and make it visible in the dashboard.  
You own the benchmark pipeline and the UI; Groupmate 1 owns the fix→PR pipeline.

---

## What you already shipped ✅

| Item | Location | Notes |
|------|----------|-------|
| Seed PRs | `packages/bench/data/seeds.txt` | 10 hand-picked merged a11y PRs |
| Mine script | `packages/bench/src/mine.ts` | GitHub search → `candidates.jsonl` |
| Curate script | `packages/bench/src/curate.ts` | LLM → `data/tasks/ramp-*.json` (23 tasks) |
| Scoring | `packages/scoring/src/score.ts` | naked vs harness recall/precision |
| Leaderboard infra | `packages/scoring/src/leaderboard*.ts` | OpenAI models configured; Claude commented out |
| Control-plane API wiring | `packages/control-plane/src/benchmark.ts` | scores, leaderboard, live-run, pr-card |
| Dashboard (3 tabs) | `apps/dashboard/src/pages/` | Live Run, Scores, PR Card — wired to API |
| First real numbers | `ramp.db` (gitignored) | e.g. naked ~40% recall, harness ~13% recall (23 tasks) |
| Scoring pipeline fixes | `packages/scoring/src/match.ts`, `audit-context.ts` | Looser WCAG matching, sourceFile inference, composite HTML fixtures (not escaped `<pre>`) |

---

## Why harness loses today (read this first)

**Naked and harness are not auditing the same thing:**

| Mode | What it sees | Good at |
|------|----------------|---------|
| **Naked** | Raw source files in the LLM prompt | `.tsx`, `.jsx`, `.css` — reading markup from code |
| **Harness** | Playwright page + axe + screen-reader tools | Rendered HTML, live contrast, keyboard/focus |

Most of our 23 tasks are **source-code fixes** (React/CSS). Naked has an unfair advantage on those.  
Harness should win on **runtime-visible** bugs — missing alt on a rendered `<img>`, icon buttons in DOM, contrast on painted text, landmarks in HTML.

**Recent smoke test (after scoring fixes):**

| Task | File type | Naked | Harness |
|------|-----------|-------|---------|
| ramp-001 | `.html` | 0% | **100%** |
| ramp-002 | `.css` contrast | 50% | 0% |
| ramp-003 | `.tsx` alt text | 100% | 50% |

**Goal:** make harness legitimately better by fixing *what we test and how we build the audit page* — **not** by hardcoding scores or weakening matching for harness only.

### Do NOT do this ❌

- Lower matching bar for harness only (same `matchFinding` rules for both modes)
- Manually bump leaderboard numbers
- Skip naked runs or filter out tasks where harness loses without documenting why
- Mark tasks as "harness wins" in code

### Do this instead ✅

- Curate tasks that match what harness actually inspects (rendered HTML)
- Build fair audit fixtures so harness sees real DOM, not escaped source
- Report **split metrics** (HTML-live vs source-code tasks)
- Use **ablation** to prove tools help (disable screen-reader → recall drops)

---

## What is still missing ❌ (your backlog)

| Area | Status | Your task |
|------|--------|-----------|
| Leaderboard real data | 🔶 | Run `leaderboard` command; `leaderboard.json` is empty |
| Claude / Gemini models | 🔶 | Uncomment when API keys arrive |
| **Fair harness benchmark** | 🔶 | `auditMode` tags, HTML-only subset, split dashboard metrics |
| **Audit fixture quality** | 🔶 | CSS selector probes, better JSX extraction in `audit-context.ts` |
| Ablation studies | ❌ | Disable SR tools / WCAG hints, re-score |
| Benchmark scale | ❌ | 50–100+ tasks (prioritize HTML-live tasks) |
| Dashboard: fix pipeline UX | ❌ | “Generate Fix PR” button → Groupmate 1’s `/pipeline` |
| Dashboard: real before→after | 🔶 | Scores page still partly mock until fix loop ships |
| Devpost / README | ❌ | Demo narrative + screenshots |

---

## Your concrete tasks (in order)

### P0 — Verify your baseline

```bash
pnpm install
pnpm build

# Terminal 1
pnpm dev:control-plane    # :8787 — JSON API only

# Terminal 2
pnpm dev:dashboard        # :5173 — UI

# Confirm API
curl http://localhost:8787/benchmark/scores
curl http://localhost:8787/benchmark/leaderboard
```

---

### Task 1 — Run OpenAI leaderboard (do this next)

Infrastructure is ready. Populate real multi-model data:

```bash
# Full run (23 tasks × 2 OpenAI models × 2 modes — slow + uses API credits)
pnpm --filter @ramp/scoring leaderboard

# Smoke test first
SCORE_LIMIT=3 pnpm --filter @ramp/scoring leaderboard
```

Output: `packages/scoring/data/leaderboard.json`

Then restart control-plane and refresh dashboard **Scores** tab.

**Models configured:** GPT-4o mini, GPT-4o (`packages/scoring/src/leaderboard-models.ts`)

---

### Task 2 — Add Claude when key arrives

1. Set `ANTHROPIC_API_KEY` in `.env`
2. Uncomment Claude block in `packages/scoring/src/leaderboard-models.ts`
3. Re-run `pnpm --filter @ramp/scoring leaderboard`
4. Dashboard leaderboard table updates automatically

Same pattern for Gemini: add entry with `GOOGLE_API_KEY`.

---

### Task 3 — Scale benchmark to 50–100+ tasks

```bash
# Re-mine (delete candidates.jsonl first to avoid duplicates)
rm packages/bench/data/candidates.jsonl
pnpm --filter @ramp/bench mine

# Curate more tasks
pnpm --filter @ramp/bench curate

# Re-score
pnpm --filter @ramp/scoring score
# or full leaderboard
pnpm --filter @ramp/scoring leaderboard
```

**Quality gate:** Manually spot-check 3 random `data/tasks/ramp-*.json` files — verify `type`, `wcagRule`, and `file` match the PR diff.

**Type quotas:** Curate stratifies by violation type; don’t let `missing_alt_text` dominate.

---

### Task 3b — Make harness win fairly (highest priority after leaderboard)

This is how you get credible “harness beats naked” numbers **without hardcoding**.

#### Step 1: Tag each task with `auditMode`

Add to `BenchTask` / task JSON (coordinate with `packages/shared` if needed):

```json
{
  "id": "ramp-001",
  "auditMode": "html-live",
  ...
}
```

| Value | Meaning | Score in |
|-------|---------|----------|
| `html-live` | Expected findings in `.html`/`.htm`; bug visible in rendered DOM | **Primary harness vs naked comparison** |
| `source-code` | Expected findings in `.tsx`, `.jsx`, `.css`, `.ts`, etc. | Naked-favored; report separately or exclude from harness headline |

**Auto-tag rule (until curate emits it):** if all `expectedFindings[].file` end in `.html`/`.htm` → `html-live`; else → `source-code`.

When mining/curating new tasks, **prioritize HTML template PRs** (Django/Jekyll/static sites, `examples/*.html`).

#### Step 2: Re-curate 15–20 HTML-live tasks

Current bench: only ~3 tasks are HTML-only. Target **15–20 html-live tasks** with:

- Real merged a11y PRs
- Small diff (1–3 files)
- Violation visible in DOM (alt, aria-label, landmarks, form labels)

Hand-pick seeds in `seeds.txt` from: static sites, template repos, `examples/*.html` folders.

#### Step 3: Improve audit fixtures (`packages/scoring/src/audit-context.ts`)

Already done: composite page, JSX tag extraction, multi-html combine.

**Still to do:**

1. **CSS contrast tasks** (e.g. ramp-002, ramp-014) — read expected `line` in CSS file, extract the actual class/selectors from that region, render elements that use those classes (not generic probe buttons).
2. **TSX tasks** — extract a **window around expected `line`** (±25 lines), not just regex tag scan; convert `className`→`class`, keep string literal `alt`/`aria-label`.
3. **Multi-file HTML** — already combined into one composite page; verify each section has `data-source-file="…"`.

#### Step 4: Split scoring + dashboard metrics

In `score.ts` / `leaderboard.ts`, aggregate separately:

```text
html-live:   harness recall X%  vs  naked recall Y%   (N tasks)
source-code: harness recall X%  vs  naked recall Y%   (M tasks)
all:         harness recall X%  vs  naked recall Y%   (N+M tasks)
```

Dashboard Scores tab: show **two rows or tabs** — “HTML-live (fair)” and “All tasks”.  
Devpost headline uses **html-live** numbers.

#### Step 5: Verify with ablation (proves harness value)

After HTML-live subset exists, run:

```bash
pnpm --filter @ramp/scoring score                          # baseline
RAMP_DISABLE_SR=1 pnpm --filter @ramp/scoring score        # recall should drop
RAMP_DISABLE_AXE=1 pnpm --filter @ramp/scoring score     # recall should drop
```

Coordinate with Groupmate 1 to add flags in `packages/harness/src/audit.ts` if not present yet.

#### Step 6: Re-grade old batches (free — no API)

```bash
pnpm --filter @ramp/scoring regrade 1781863218695
```

Uses current matching rules on existing DB findings; useful after `match.ts` changes.

**Success criteria (realistic MVP):**

- [ ] HTML-live subset (≥15 tasks): **harness recall ≥ naked recall + 15%**
- [ ] Ablation: disabling screen-reader tool drops html-live recall measurably
- [ ] Same `matchFinding` rules for both modes — no special casing
- [ ] Dashboard shows split metrics so judges see an honest story

**Coordinate with Groupmate 1 (harness agent, not scoring cheats):**

- Require `sourceFile` in `submit_finding` (prompt + reject if missing on benchmark runs)
- Increase `maxSteps` to 25 on complex pages
- Map axe violations → `sourceFile` using hints / `data-source-file` sections

---

### Task 4 — Ablation experiments (Task G)

Goal: show *why* the harness helps (screen reader, contrast tools, etc.).

1. Add env flags in harness (coordinate with Groupmate 1 if flags live in `packages/harness`):
   - `RAMP_DISABLE_SR=1` — no screen-reader serialization
   - `RAMP_DISABLE_AXE=1` — no axe clues
   - `RAMP_DISABLE_TOOLS=1` — naked-like mode inside harness
2. Re-run scoring with each flag; record recall drop in a table for Devpost
3. Optional: store ablation runs in DB with distinct run-id prefix (`ablation-`)

---

### Task 5 — Dashboard: wire fix pipeline (blocked on Groupmate 1)

When Groupmate 1 ships `POST /pipeline`:

**Files to edit:**

- `apps/dashboard/src/lib/api.ts` — add `runPipeline({ repo, url, createPullRequest })`
- `apps/dashboard/src/pages/LiveRunPage.tsx` — show before + after findings
- `apps/dashboard/src/pages/ScoresPage.tsx` — real before→after from pipeline run (not mock)
- `apps/dashboard/src/pages/PRCardPage.tsx` — PR URL + diff from pipeline response

**UX:** Add **“Generate Fix PR”** button on Live Run or a new “Pipeline” panel.

---

### Task 6 — Dashboard polish

- Show `computedAt` on leaderboard rows
- Empty state when `leaderboard.json` has no entries (“Run `pnpm … leaderboard`”)
- Severity breakdown chart (critical / serious / moderate / minor)
- Loading + error states (partially done via `useRampData.ts`)

---

### Task 7 — Devpost + demo materials

Write up:

1. **Problem:** detection tools stop at reports; Ramp closes the loop
2. **Evidence:** naked vs harness recall/precision table (leaderboard)
3. **Benchmark methodology:** real merged GitHub a11y PRs as ground truth
4. **Product demo:** before score → fix → after score → PR (once Groupmate 1 ships)
5. Screenshots: dashboard Scores + Live Run + PR Card

---

## Week plan

| Day | Focus |
|-----|-------|
| **1** | Run OpenAI leaderboard; confirm dashboard shows 4 rows (2 models × 2 modes) |
| **2** | **Task 3b:** add `auditMode` tags; re-curate 15 HTML-live tasks |
| **3** | Improve CSS/TSX fixtures in `audit-context.ts`; split dashboard metrics |
| **4** | Ablation runs; add Claude to leaderboard if key ready |
| **5** | Wire `/pipeline` UI; full demo rehearsal with Groupmate 1 |

---

## Definition of done (your part)

- [ ] Leaderboard has real OpenAI data (GPT-4o mini + GPT-4o)
- [ ] **HTML-live subset (≥15 tasks)** with harness beating naked on recall (fair comparison)
- [ ] Dashboard shows **split metrics** (html-live vs all tasks)
- [ ] Ablation table: at least 2 configs with recall drop on html-live tasks
- [ ] Benchmark has **50+** total tasks (mix of html-live + source-code)
- [ ] Dashboard shows live benchmark scores (no mock fallback in normal operation)
- [ ] Dashboard ready to call fix pipeline when Groupmate 1 ships it
- [ ] Devpost draft with numbers + screenshots (lead with html-live harness win)
- [ ] `pnpm build` green; no secrets committed

---

## Dependencies on Groupmate 1

| You need from them | Why |
|--------------------|-----|
| `POST /pipeline` endpoint | Generate Fix PR button |
| Run records with after-findings + after-score | Real before→after on Scores page |
| PR URL in response | PR Card page |

| They need from you | Why |
|--------------------|-----|
| Stable benchmark tasks | Regression testing audit quality |
| Leaderboard numbers | Demo credibility (“harness beats naked on **HTML-live** tasks by X%”) |
| `auditMode` on tasks | Lets harness benchmark focus on fair DOM-visible cases |
| Split metrics in dashboard | Honest story: harness wins where it should |
| Dashboard API consumer | Validates their `/audit` and `/pipeline` shapes |

---

## Key files (your directories)

```
packages/bench/
  data/seeds.txt
  data/candidates.jsonl
  data/tasks/ramp-*.json
  src/mine.ts
  src/curate.ts

packages/scoring/
  src/score.ts
  src/match.ts              # shared matching (both modes — do not special-case harness)
  src/audit-context.ts      # harness audit page builder — improve fixtures here
  src/regrade-batch.ts      # re-grade old DB batch without API calls
  src/leaderboard.ts
  src/leaderboard-models.ts
  src/leaderboard-store.ts
  data/leaderboard.json

apps/dashboard/
  src/pages/LiveRunPage.tsx
  src/pages/ScoresPage.tsx
  src/pages/PRCardPage.tsx
  src/hooks/useRampData.ts
  src/lib/api.ts
```

---

## Commands cheat sheet

```bash
pnpm --filter @ramp/bench mine
pnpm --filter @ramp/bench curate
pnpm --filter @ramp/scoring score
pnpm --filter @ramp/scoring leaderboard
pnpm --filter @ramp/scoring regrade <batchId>   # re-grade without API
SCORE_LIMIT=5 pnpm --filter @ramp/scoring score   # cheap test
pnpm --filter @ramp/scoring test:match            # unit tests for matching + fixtures

pnpm dev:control-plane
pnpm dev:dashboard
pnpm build
```

---

## Field alignment (do not break)

Benchmark grading matches findings when (same rules for **both** naked and harness):

```text
type      === expectedFinding.type
wcagRule  overlaps expectedFinding.wcagRule (e.g. "4.1.2" matches "1.3.1 / 4.1.2")
file      === finding.sourceFile  (or inferred from page URL — see match.ts)
```

Implementation: `packages/scoring/src/match.ts` — **never add harness-only matching shortcuts.**

Violation types must use `ViolationType` from `@ramp/shared` — same set as harness.

---

## Env vars (`.env` at repo root)

```bash
GITHUB_TOKEN=            # mine script
OPENAI_API_KEY=          # curate + scoring + leaderboard
ANTHROPIC_API_KEY=       # Claude leaderboard (when ready)
GOOGLE_API_KEY=          # Gemini (optional)
SCORE_LIMIT=             # optional cap for cheap test runs
RAMP_DB_PATH=./ramp.db
```

---

## Cost tips

- **curate:** use `gpt-4o-mini`
- **leaderboard:** most expensive — run on full task set only when stable; use `SCORE_LIMIT` for dev
- Set spending caps on OpenAI / Anthropic dashboards

---

## Do not edit (unless coordinated)

- `packages/harness/**` — Groupmate 1
- `packages/control-plane/**` — Groupmate 1 (except consuming their API from dashboard)
- Fix loop / PR pipeline code — Groupmate 1

If you need a new API field from control-plane, open a small PR and tag Groupmate 1.
