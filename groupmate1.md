

# Groupmate 1 — Pipeline Owner

**Role:** Detect → Score → Fix → Validate → Pull Request  
**Owns:** `packages/harness`, `packages/control-plane`  
**Coordinates on:** `packages/shared` (types/schema — announce before editing)

Your job is to turn Ramp from **“finds accessibility issues”** into **“finds, fixes, validates, and opens a PR.”**  
This is the core product path described in `SKILL.md` Steps 1–8.

---

## What you already shipped ✅


| Item                     | Location                                        | Notes                                                       |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------- |
| Audit agent (`runAudit`) | `packages/harness/src/audit.ts`                 | Playwright + axe + a11y tree + screen-reader sim + AI tools |
| HTTP audit endpoint      | `packages/control-plane/src/server.ts`          | `POST /audit` → findings + before score                     |
| Compliance scoring hook  | Uses `@ramp/scoring` `computeScore()`           | Wired in `/audit` handler                                   |
| GitHub PR helper         | `packages/control-plane/src/github.ts`          | `openPr()`, `preflight()`                                   |
| PR pipeline smoke test   | `packages/control-plane/src/scripts/test-pr.ts` | `pnpm test:pr` (needs `GITHUB_TOKEN`, `GITHUB_TARGET_REPO`) |
| DB persistence           | `packages/control-plane/src/db.ts`              | runs, findings, scores                                      |


---

## What is still missing ❌ (your backlog)

These map directly to `SKILL.md`:


| SKILL.md step          | Status | Your task                                     |
| ---------------------- | ------ | --------------------------------------------- |
| 1. Repository setup    | ❌      | Clone repo, install deps, detect framework    |
| 2. Start the app       | ❌      | Run `dev`/`build`, wait for URL               |
| 3. Accessibility audit | ✅      | Already done                                  |
| 4. Before score        | ✅      | Already done                                  |
| 5. Fix planning        | ❌      | Group findings, assign repair strategy + risk |
| 6. Code modification   | ❌      | `**runFixLoop` is a stub**                    |
| 7. Validation loop     | ❌      | Re-audit, build, lint; revert on failure      |
| 8. Pull request        | 🔶     | `openPr()` exists but not wired to fix loop   |
| End-to-end entry       | ❌      | `**runPipeline` is a stub**                   |


Key stub files:

- `packages/shared/src/fix.ts` — throws “not implemented”
- `packages/control-plane/src/index.ts` — `runPipeline()` throws

---

## Your concrete tasks (in order)

### P0 — Verify your baseline

```bash
pnpm install
pnpm build
pnpm dev:control-plane          # :8787

# Audit smoke test
curl -X POST http://localhost:8787/audit \
  -H 'content-type: application/json' \
  -d '{"url": "file:///path/to/sample.html"}'

# PR pipeline (optional, needs GitHub token)
pnpm --filter @ramp/control-plane test:pr
```

Playwright must be installed:

```bash
pnpm --filter @ramp/harness exec playwright install chromium
```

---

### Task 1 — Implement `runFixLoop` (highest priority)

**File:** `packages/control-plane/src/fix-loop.ts` (new), export from `index.ts`

**Input:** `RunFixLoopOptions` from `@ramp/shared` (`runId`, `repoPath`, `findings`, `safeMode`)

**MVP fix types (match harness + bench):**

1. `missing_alt_text`
2. `missing_form_labels`
3. `icon_button_accessible_names`
4. `low_color_contrast`
5. `missing_landmarks`

**Per finding:**

1. Skip if `safeMode` and (`confidence < 0.7` or `!autoFixable`)
2. LLM generates a minimal patch for `sourceFile` (read file → propose edit)
3. Apply patch to disk
4. Run validation (Task 3)
5. On failure → revert file, mark `FixResult` as `needs_human_review`
6. On success → mark `FixResult` as `fixed`

**Return:** `FixResult[]` per finding (status, file, description)

Replace the stub in `packages/shared/src/fix.ts` by re-exporting the control-plane implementation, or implement directly in control-plane and update shared to delegate.

---

### Task 2 — Implement validation loop

**File:** `packages/control-plane/src/validate.ts` (new)

After each fix (or batch of fixes):

1. Re-run `runAudit({ url, repo: repoPath, runId })`
2. Run project commands from `package.json` if present:
  - `build` / `lint` / `test` (best-effort; skip if missing)
3. Compare before vs after:
  - `computeScore(beforeFindings)` vs `computeScore(afterFindings)`
  - axe violation count delta
4. If build fails or page crashes → revert last patch

Persist **after** score to DB (`phase: "after"`).

---

### Task 3 — Repo setup + dev server

**File:** `packages/control-plane/src/repo-setup.ts` (new)

For `runPipeline({ repoUrl, branch?, targetUrl? })`:

1. Shallow clone to temp dir (reuse pattern from `packages/bench/src/curate.ts`)
2. Detect framework from `package.json` (React, Next.js, Vue, plain HTML)
3. Run install (`pnpm install` / `npm install`)
4. If no `targetUrl`, start dev server and poll until reachable
5. On failure → return SKILL.md `setup_failed` JSON (do not attempt fixes)

---

### Task 4 — Implement `runPipeline`

**File:** `packages/control-plane/src/pipeline.ts` (new), wire in `index.ts`

```text
runPipeline(options)
  → setup repo + start app
  → runAudit (before)
  → computeScore → persist "before"
  → runFixLoop (safe fixes only)
  → runAudit (after)
  → computeScore → persist "after"
  → if createPullRequest: git commit + openPr()
  → return PipelineResult matching SKILL.md output shape
```

**Output should include:**

- `before_score`, `after_score`
- `violations_before`, `violations_after`
- `fixed_issues[]`, `remaining_issues[]`
- `validation` (axe, build, lint status)
- `pull_request_url` (if requested)

---

### Task 5 — New HTTP endpoint

**File:** `packages/control-plane/src/server.ts`

Add either:

- `POST /pipeline` — full detect→fix→PR flow, or
- Extend `POST /audit` with `{ "fix": true, "create_pull_request": true }`

Groupmate 2’s dashboard will call this for the **“Generate Fix PR”** button.

Also expose:

- `GET /runs/:id` — already exists; ensure after-findings + after-score are included when available

---

### Task 6 — Wire PR creation

Use existing `openPr()` or a multi-file git workflow:

1. Create branch `ramp/a11y-repair-<timestamp>`
2. Commit all fixed files
3. Open PR with SKILL.md template body (before/after scores, fix list, validation)

Test with `pnpm test:pr` first, then with a real fix run on a demo repo.

---

### Task 7 — Demo repo

Create or pick one **intentionally broken** React/Next app with:

- Missing alt text
- Unlabeled inputs
- Icon buttons without names
- Low contrast button
- Missing `<main>` landmark

This is the repo you use for the hackathon demo video.

---

### Task 8 — Harness improvements (parallel, lower priority)

**Directory:** `packages/harness/src/`

- Better `sourceFile` mapping (DOM node → component file)
- Screenshot capture for evidence (SKILL.md Step 3)
- Static code search to locate source from DOM selectors

Coordinate with Groupmate 2: benchmark grading uses `finding.sourceFile === task.file`.

---

## Week plan


| Day   | Focus                                             |
| ----- | ------------------------------------------------- |
| **1** | `runFixLoop` MVP — alt text + form labels only    |
| **2** | Validation loop + after score in DB               |
| **3** | `runPipeline` + repo setup + dev server           |
| **4** | `POST /pipeline` + PR wiring + demo repo          |
| **5** | End-to-end rehearsal with Groupmate 2’s dashboard |


---

## Definition of done (your part)

- [ ] Give a repo URL → Ramp clones, starts app, audits automatically
- [ ] Returns structured before score + findings
- [ ] Fixes at least **3 issue types** with safe mode on
- [ ] After score is higher; build/lint pass (or gracefully skipped)
- [ ] Opens a real GitHub PR (or returns diff if PR disabled)
- [ ] `pnpm build` green; no secrets committed

---

## Dependencies on Groupmate 2


| You need from them                               | Why                                                 |
| ------------------------------------------------ | --------------------------------------------------- |
| Stable `Finding` / `FixResult` types in `shared` | Fix loop I/O contract                               |
| Dashboard calling your new `/pipeline` endpoint  | Demo UX                                             |
| Benchmark tasks (optional)                       | Regression test that audit still finds known issues |



| They need from you                             | Why                      |
| ---------------------------------------------- | ------------------------ |
| Working `POST /pipeline`                       | “Generate Fix PR” button |
| Run record with before + after findings/scores | Live Run + Scores pages  |
| PR URL in pipeline response                    | PR Card page             |


---

## Env vars (`.env` at repo root)

```bash
OPENAI_API_KEY=          # audit + fix LLM calls
ANTHROPIC_API_KEY=       # optional, harness falls back to OpenAI
GITHUB_TOKEN=            # PR creation
GITHUB_TARGET_REPO=      # owner/repo for test:pr and openPr
CONTROL_PLANE_PORT=8787
RAMP_DB_PATH=./ramp.db   # optional override
```

---

## Commands cheat sheet

```bash
pnpm dev:control-plane
pnpm --filter @ramp/control-plane test:pr
pnpm --filter @ramp/harness exec playwright install chromium
pnpm build
```

---

## Do not edit (unless coordinated)

- `packages/bench/**` — Groupmate 2
- `packages/scoring/**` — Groupmate 2 (except using `computeScore` as a dependency)
- `apps/dashboard/**` — Groupmate 2

