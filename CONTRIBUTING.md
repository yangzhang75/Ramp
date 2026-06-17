# Contributing to Ramp

Ramp is a pnpm + TypeScript (ESM) monorepo. This guide keeps a fast-moving
hackathon team from stepping on each other.

## Layout

```
packages/
  shared/         Types (BenchTask/Finding/FixResult/Score), Drizzle SQLite
                  schema + getDb(), and the runAudit/runFixLoop signatures.
  harness/        Turns a general LLM into a WCAG expert (rule library, DOM
                  reasoning, screen-reader sim, contrast tools). Implements runAudit.
  scoring/        Compliance scoring + benchmark recall metrics.
  bench/          A11y-Bench: annotated benchmark tasks + grading.
  control-plane/  Orchestrates Detect→Score→Fix→Validate→PR. Implements runFixLoop.
apps/
  dashboard/      UI: issue list, severity, before/after score, PR summary.
```

## Directory ownership

Edit your own directory. To change someone else's, open a PR and tag them — do
not push directly into another owner's package.

| Directory                  | Owner            | Scope                                            |
| -------------------------- | ---------------- | ------------------------------------------------ |
| `packages/shared`          | Platform / Lead  | Types, DB schema, shared signatures. Changes here ripple everywhere — coordinate before editing. |
| `packages/harness`         | Harness owner    | WCAG rules, DOM reasoning, screen-reader sim, contrast, `runAudit`. |
| `packages/scoring`         | Scoring owner    | Score model + recall metrics.                    |
| `packages/bench`           | Benchmark owner  | A11y-Bench fixtures + grading.                   |
| `packages/control-plane`   | Pipeline owner   | Orchestration, fix loop, sandbox validation, PR creation. |
| `apps/dashboard`           | Frontend owner   | Dashboard UI.                                    |
| root config (`tsconfig*`, `pnpm-workspace.yaml`, `.gitignore`, CI) | Platform / Lead | Tooling / build wiring. |

`packages/shared` is the shared contract: anyone can depend on it, but any
edit to its types or schema must be announced so dependents update together.

## Setup

```bash
pnpm install
pnpm build      # tsc -b across all packages (project references)
```

`pnpm typecheck` is an alias for the same `tsc -b`. `pnpm clean` removes build
output.

## Git workflow

- **Always `git pull --rebase` before you push.** Never merge-commit `main`
  into your branch; keep history linear.
  ```bash
  git pull --rebase origin main
  ```
- Work on a branch, open a PR, get a quick review, then merge.
- Resolve rebase conflicts in your own files; ping the owner for theirs.

## Commit message prefixes

Use Conventional Commits, scoped to the package you touched:

```
<type>(<scope>): <summary>
```

- **types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`
- **scopes:** `shared`, `harness`, `scoring`, `bench`, `control-plane`,
  `dashboard`, or `repo` for root/tooling changes.

Examples:

```
feat(harness): add color-contrast computation tool
fix(shared): correct boolean mode on findings.auto_fixable
chore(repo): bump typescript to 5.7
docs(bench): document annotation format
```

## Before you push — checklist

1. `git pull --rebase origin main`
2. `pnpm build` is green (no type errors).
3. Commit message uses the prefix convention above.
4. You only changed files in directories you own (or coordinated otherwise).
5. No secrets — `.env` and `ramp.db` are gitignored; keep them out of commits.
