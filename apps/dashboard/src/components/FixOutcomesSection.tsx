import { useState } from "react";
import { ExternalLink, Headphones, TrendingUp } from "lucide-react";
import { Badge } from "./ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.js";
import { Button } from "./ui/button.js";
import fixOutcomes from "../data/fix-outcomes.json";

interface FixDemo {
  id: string;
  label: string;
  title: string;
  repo: string;
  prUrl?: string;
  beforeScore: number | null;
  afterScore: number | null;
  beforeAxeViolations: number;
  afterAxeViolations: number;
  beforeSemanticIssues?: number;
  afterSemanticIssues?: number;
  screenReaderBefore: string[];
  screenReaderAfter: string[];
}

const demos = (fixOutcomes as { demos: FixDemo[] }).demos;

function ScreenReaderBlock({ lines, tone }: { lines: string[]; tone: "before" | "after" }) {
  const border =
    tone === "before" ? "border-red-500/30 bg-red-950/20" : "border-green-500/30 bg-green-950/20";
  const label = tone === "before" ? "Before" : "After";

  return (
    <div className={`rounded-lg border p-4 ${border}`}>
      <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        <Headphones className="h-3.5 w-3.5" />
        Screen reader — {label}
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-relaxed">
        {lines.join("\n")}
      </pre>
    </div>
  );
}

export function FixOutcomesSection() {
  const [activeId, setActiveId] = useState(demos[0]?.id ?? "");

  const demo = demos.find((d) => d.id === activeId) ?? demos[0];
  if (!demo) return null;

  const isSemantic = demo.beforeSemanticIssues != null;
  const scoreBefore = demo.beforeScore;
  const scoreAfter = demo.afterScore;

  return (
    <Card className="border-[var(--color-primary)]/20">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-[var(--color-primary)]" />
              Fix loop outcomes
            </CardTitle>
            <CardDescription>
              Real before → after from the audit → fix → verify → PR pipeline
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {demos.map((d) => (
              <Button
                key={d.id}
                size="sm"
                variant={d.id === activeId ? "default" : "outline"}
                onClick={() => setActiveId(d.id)}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{demo.repo}</Badge>
          <span className="text-sm font-medium">{demo.title}</span>
          {demo.prUrl && (
            <a
              href={demo.prUrl}
              className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
            >
              View PR
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {!isSemantic && scoreBefore != null && scoreAfter != null && (
          <div className="flex flex-wrap items-end justify-center gap-4 py-4">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-red-300">Compliance before</p>
              <p className="text-6xl font-bold text-red-300">{scoreBefore}</p>
            </div>
            <p className="pb-4 text-3xl text-[var(--color-muted-foreground)]">→</p>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-[var(--color-primary)]">
                Compliance after
              </p>
              <p className="text-6xl font-bold text-[var(--color-primary)]">{scoreAfter}</p>
            </div>
            <p className="pb-3 text-sm text-[var(--color-muted-foreground)]">
              +{scoreAfter - scoreBefore} pts
            </p>
          </div>
        )}

        {isSemantic && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/40 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                axe-core (both passes)
              </p>
              <p className="mt-2 text-4xl font-bold">
                {demo.beforeAxeViolations} → {demo.afterAxeViolations}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                axe never saw the problem
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-[var(--color-primary)]">
                Ramp semantic issues
              </p>
              <p className="mt-2 text-4xl font-bold text-[var(--color-primary)]">
                {demo.beforeSemanticIssues} → {demo.afterSemanticIssues}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Meaningless names fixed
              </p>
            </div>
          </div>
        )}

        {!isSemantic && (
          <div className="flex flex-wrap items-center justify-center gap-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/30 px-6 py-4">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                axe violations
              </p>
              <p className="mt-1 text-3xl font-bold">
                <span className="text-red-300">{demo.beforeAxeViolations}</span>
                <span className="mx-2 text-[var(--color-muted-foreground)]">→</span>
                <span className="text-[var(--color-primary)]">{demo.afterAxeViolations}</span>
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <ScreenReaderBlock lines={demo.screenReaderBefore} tone="before" />
          <ScreenReaderBlock lines={demo.screenReaderAfter} tone="after" />
        </div>
      </CardContent>
    </Card>
  );
}
