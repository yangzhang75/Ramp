# Ramp

**Accessibility audit → fix → PR. axe detects; Ramp understands and fixes.**

Lighthouse and axe-core *find* WCAG violations and stop at a report. Ramp closes the full loop:
it audits a real rendered page, reasons about the WCAG criterion, **writes the fix, verifies
it with axe-core, and opens a merge-ready pull request** — and it catches semantic issues axe
is blind to (alt text that just says `"image"`, links that say `"click here"`).

> **axe: 0 violations · Ramp: 12 semantic issues axe can't see** (across 3 demo pages).

---

## Three pillars

| Pillar | Package | What it does |
|---|---|---|
| **A11y-Bench** | `packages/bench` | 51 ground-truth tasks mined from real merged a11y PRs; scores **naked LLM vs harness** on recall **and** precision, split by `html-live` / `source-code`. |
| **Harness** | `packages/harness` | Drives a headless page through Playwright + axe-core + accessibility tree + screen-reader simulation + contrast/focus inspectors + **semantic review**; an LLM agent reasons over the evidence (`runAudit`). |
| **Auto-fix loop** | `packages/control-plane` | sandbox checkout → audit → **Claude Code** fix → **axe verify (before/after score)** → **GitHub PR**. Sentry monitors the loop. |

## Real fix PRs (verified, before → after)

| Repo | Fix | Score | PR |
|---|---|---|---|
| `bad.html` (fixture) | alt + contrast + button names | **60 → 96** | [yangzhang75/Ramp#7](https://github.com/yangzhang75/Ramp/pull/7) |
| semantic (fixture) | meaningless alt/link/button names axe passes | semantic 5 → 0 | [yangzhang75/Ramp#10](https://github.com/yangzhang75/Ramp/pull/10) |
| `aigov-ops…` (real OSS) | landmarks + skip link + `<main>` | **92 → 100** | [PR#1](https://github.com/yangzhang75/aigov-ops-open-source-vendor-rfi-rapp-johnston-june-2026/pull/1) |
| `caelaria` (real OSS) | unlabeled `<select>` controls | **84 → 92** | [PR#1](https://github.com/yangzhang75/caelaria/pull/1) |
| `Whatifarcade` (real OSS) | form label + `<main>` landmark | **96 → 100** | [PR#1](https://github.com/yangzhang75/Whatifarcade/pull/1) |

*PRs are opened on forks — Ramp audits and fixes the real page without spamming upstream maintainers.*

## Architecture

```mermaid
flowchart LR
  USER["Frontend repo / URL"] --> API

  subgraph CP["Control Plane · packages/control-plane"]
    API["node:http API<br/>POST /audit · /benchmark"]
    DB[("Drizzle + SQLite<br/>runs · findings · scores")]
    API --- DB
  end

  subgraph H["Harness · packages/harness"]
    PW["Playwright page"]
    TOOLS["axe-core · a11y tree<br/>screen-reader · contrast<br/>focus-order · semantic review"]
    AGENT(["LLM audit agent<br/>runAudit · gpt-4o-mini"])
    PW --> TOOLS --> AGENT
  end

  subgraph FL["Fix Loop · packages/control-plane"]
    SB["sandbox checkout<br/>fork @ base commit"]
    FIX["Claude Code fix<br/>claude -p"]
    VER["axe verify<br/>before → after score"]
    PR["GitHub PR · Octokit<br/>opened on fork"]
    SB --> FIX --> VER --> PR
  end

  API --> PW
  AGENT -->|"findings + before score"| DB
  AGENT --> SB
  VER -->|"after score"| DB
  PR --> GH["GitHub<br/>merge-ready PR"]
  SENTRY{{"Sentry monitoring"}} -.-> CP
  SENTRY -.-> H
  SENTRY -.-> FL
```

## Quick start

```bash
pnpm install

# 1. Self-contained demo — repair bad.html and score it (free, no API keys)
pnpm --filter @ramp/control-plane fix:demo                    # 60 → 96

# 2. Detection benchmark — naked LLM vs harness, recall + precision
pnpm --filter @ramp/bench score:fixtures                      # needs OPENAI_API_KEY
pnpm --filter @ramp/scoring leaderboard

# 3. Real-repo fix loop — fork → audit → fix → verify → open PR
TASK_ID=ramp-048 pnpm --filter @ramp/control-plane fix:repo   # needs OPENAI_API_KEY + GITHUB_TOKEN

# 4. Web UI (landing + demo dashboard)
pnpm dev:control-plane     # :8787 — API (optional, for Live Run / benchmark tabs)
pnpm dev:dashboard         # :5173 — Home tab + axe vs Ramp · Auto-fix · Scores · …
```

## Tech stack

Playwright · axe-core · Vercel AI SDK (`ai` + `@ai-sdk/openai`, gpt-4o-mini) ·
Claude Code (`claude -p`, headless fixer) · Drizzle ORM + SQLite · React + Vite ·
Sentry · Octokit · `node:http` · TypeScript + pnpm workspaces.

## Monorepo layout

| Path | Role |
|---|---|
| `packages/shared` | Types · Drizzle schema · DB client |
| `packages/harness` | Audit tools + `runAudit` agent |
| `packages/scoring` | Recall/precision metrics + leaderboard |
| `packages/bench` | A11y-Bench tasks + miners/curators |
| `packages/control-plane` | HTTP API + fix loop + GitHub PRs |
| `apps/dashboard` | React + Vite site: **Home** (product landing) + interactive demo tabs |

---

*Detect → Score → Fix → Validate → Pull Request. The artifact isn't a report — it's a reviewable PR.*
