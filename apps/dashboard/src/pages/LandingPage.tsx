import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { ArchitectureDiagram } from "../components/ArchitectureDiagram.js";
import autoFixData from "../data/auto-fix-results.json";

const GITHUB_URL = "https://github.com/yangzhang75/Ramp";
const SHOWCASE_IDS = ["aigov-ops", "caelaria", "whatifarcade"] as const;

interface AutoFixDemo {
  id: string;
  repo: string;
  category: string;
  title: string;
  prUrl?: string;
  beforeScore: number | null;
  afterScore: number | null;
  beforeAxeViolations: number | null;
  afterAxeViolations: number | null;
}

const prCards = (autoFixData.demos as AutoFixDemo[]).filter((d) =>
  SHOWCASE_IDS.includes(d.id as (typeof SHOWCASE_IDS)[number]),
);

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-sm font-medium uppercase tracking-widest text-[var(--color-primary)]">
      {children}
    </p>
  );
}

export function LandingPage({ onExploreDemo }: { onExploreDemo: () => void }) {
  return (
    <div className="-mx-6 -mt-8">
      <section className="relative overflow-hidden border-b border-[var(--color-border)]">
        <div className="hero-grid absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-[var(--color-primary)]/10 blur-3xl" />
        <div className="relative px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              Open-source · audit → fix → PR
            </p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl lg:leading-[1.1]">
              axe detects.{" "}
              <span className="text-[var(--color-primary)]">Ramp understands and fixes.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-muted-foreground)]">
              An open-source agent that audits accessibility, fixes the code, and opens a
              merge-ready PR — catching the semantic issues detectors can&apos;t see.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="glow-primary inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-6 py-3.5 text-sm font-semibold text-[var(--color-primary-foreground)] transition hover:opacity-90"
              >
                View on GitHub
                <ArrowRight className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={onExploreDemo}
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                Explore live demo
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-8 text-sm text-[var(--color-muted-foreground)]">
              <span className="font-mono text-[var(--color-foreground)]">axe: 0</span> violations ·{" "}
              <span className="font-mono text-[var(--color-primary)]">Ramp: 12</span> semantic issues
              axe can&apos;t see
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--color-border)] px-6 py-16 sm:py-20">
        <SectionLabel>The problem</SectionLabel>
        <div className="grid gap-6 md:grid-cols-2">
          <blockquote className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/50 p-8 text-xl font-medium leading-relaxed">
            1.3B people live with disabilities.{" "}
            <span className="text-[var(--color-primary)]">96% of websites</span> have accessibility
            barriers.
          </blockquote>
          <blockquote className="rounded-xl border border-red-500/20 bg-red-950/20 p-8 text-xl font-medium leading-relaxed">
            Tools like axe only check if a label{" "}
            <span className="text-red-300">EXISTS</span> — not if it&apos;s{" "}
            <span className="text-[var(--color-primary)]">meaningful</span>.
          </blockquote>
        </div>
      </section>

      <section className="border-b border-[var(--color-border)] px-6 py-16 sm:py-20">
        <SectionLabel>Why Ramp</SectionLabel>
        <h3 className="mb-10 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
          Beyond detection — judgment, repair, and proof.
        </h3>
        <div className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
              <ScanEye className="h-5 w-5" />
            </div>
            <h4 className="text-lg font-semibold">Semantic judgment</h4>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              Same page: axe reports 0 violations. Ramp finds 12 semantic issues — empty alt text,
              meaningless button names, links that say &quot;click here&quot;.
            </p>
            <div className="mt-4 flex gap-3 rounded-lg bg-[var(--color-muted)]/50 p-3 font-mono text-xs">
              <span className="text-red-300">axe 0</span>
              <span className="text-[var(--color-muted-foreground)]">/</span>
              <span className="text-[var(--color-primary)]">Ramp 12</span>
            </div>
          </article>
          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
              <Wrench className="h-5 w-5" />
            </div>
            <h4 className="text-lg font-semibold">Automatic fixes</h4>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              Ramp doesn&apos;t stop at a report. Claude Code applies minimal patches; axe
              re-verifies each change before anything ships.
            </p>
          </article>
          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
              <GitPullRequest className="h-5 w-5" />
            </div>
            <h4 className="text-lg font-semibold">Real pull requests</h4>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              The artifact isn&apos;t a report — it&apos;s a merge-ready PR on your fork, with
              before/after scores in the body.
            </p>
          </article>
        </div>
      </section>

      <section className="border-b border-[var(--color-border)] px-6 py-16 sm:py-20">
        <SectionLabel>Verified results</SectionLabel>
        <h3 className="mb-4 text-2xl font-bold sm:text-3xl">Real PRs on real repos</h3>
        <p className="mb-10 max-w-2xl text-[var(--color-muted-foreground)]">
          Fork → audit → fix → verify → open PR. Each card links to a live pull request on
          yangzhang75&apos;s fork.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {prCards.map((card) => (
            <article
              key={card.id}
              className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 p-6"
            >
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {card.category}
              </p>
              <h4 className="mt-2 text-lg font-semibold">{card.title}</h4>
              <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted-foreground)]">
                {card.repo}
              </p>
              {card.beforeScore != null && card.afterScore != null && (
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-red-300/90">{card.beforeScore}</span>
                  <span className="text-[var(--color-muted-foreground)]">→</span>
                  <span className="text-3xl font-bold text-[var(--color-primary)]">
                    {card.afterScore}
                  </span>
                </div>
              )}
              {card.beforeAxeViolations != null && card.afterAxeViolations != null && (
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  axe {card.beforeAxeViolations} → {card.afterAxeViolations}
                </p>
              )}
              {card.prUrl && (
                <a
                  href={card.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-medium text-[var(--color-primary)] hover:underline"
                >
                  View PR
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="border-b border-[var(--color-border)] px-6 py-16 sm:py-20">
        <SectionLabel>How it works</SectionLabel>
        <h3 className="mb-4 text-2xl font-bold sm:text-3xl">One command. Fully automated after that.</h3>
        <p className="mb-10 max-w-3xl text-[var(--color-muted-foreground)]">
          Bring your own GitHub token and a static HTML repo. Ramp forks it, audits with an LLM
          harness, fixes with Claude Code, verifies with axe, and opens a PR on your account.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { step: "1", icon: GitBranch, title: "Provide repo", body: "Run fix:repo with TASK_ID and your GitHub token." },
            { step: "2", icon: Bot, title: "Ramp audits & fixes", body: "Playwright + axe + screen reader feed the audit agent; Claude Code patches." },
            { step: "3", icon: ShieldCheck, title: "PR opened", body: "axe before/after scores in the PR body; Octokit opens on your fork." },
          ].map(({ step, icon: Icon, title, body }) => (
            <div
              key={step}
              className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/40 p-6"
            >
              <span className="absolute -top-3 left-6 rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-primary-foreground)]">
                {step}
              </span>
              <Icon className="mb-4 mt-2 h-8 w-8 text-[var(--color-primary)]" />
              <h4 className="font-semibold">{title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">{body}</p>
            </div>
          ))}
        </div>
        <pre className="mt-8 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-black/40 p-4 font-mono text-sm text-[var(--color-muted-foreground)]">
          <span className="text-[var(--color-primary)]">TASK_ID</span>
          =ramp-047 pnpm --filter @ramp/control-plane fix:repo
        </pre>
      </section>

      <section className="px-6 py-16 sm:py-20">
        <SectionLabel>Architecture</SectionLabel>
        <h3 className="mb-4 text-2xl font-bold sm:text-3xl">Detect → score → fix → validate → PR</h3>
        <p className="mb-8 max-w-2xl text-[var(--color-muted-foreground)]">
          51 annotated benchmark tasks · 15 html-live pages · harness + control-plane + fix loop.
        </p>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/30 p-4 sm:p-8">
          <ArchitectureDiagram />
        </div>
      </section>
    </div>
  );
}
