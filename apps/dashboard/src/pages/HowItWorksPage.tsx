import { Bot, Gauge, Layers } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import complexPrecision from "../data/complex-precision.json";

const harnessPrecision =
  complexPrecision.status === "ready" && complexPrecision.harness.precision != null
    ? Math.round(complexPrecision.harness.precision * 100)
    : null;

const pillars = [
  {
    icon: Layers,
    title: "A11y-Bench",
    stat: "51 tasks",
    description:
      "Real GitHub accessibility-fix PRs — 15 html-live pages with full gold annotations and decoys.",
  },
  {
    icon: Gauge,
    title: "Harness",
    stat: harnessPrecision != null ? `${harnessPrecision}% precision` : "Tools + context",
    description:
      "Screen-reader simulation, live contrast measurement, and a11y tree — turns generic models into audit experts.",
  },
  {
    icon: Bot,
    title: "Auto-fix loop",
    stat: "Audit → PR",
    description:
      "Claude Code applies minimal patches, axe re-verifies, Ramp opens merge-ready GitHub pull requests.",
  },
];

export function HowItWorksPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold md:text-3xl">How Ramp works</h2>
        <p className="mt-2 text-lg text-[var(--color-muted-foreground)]">
          Three pillars — benchmark, instrument, fix.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {pillars.map((pillar) => (
          <Card
            key={pillar.title}
            className="border-[var(--color-border)] bg-[var(--color-card)]/60"
          >
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                <pillar.icon className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">{pillar.title}</CardTitle>
              <CardDescription className="text-base font-semibold text-[var(--color-primary)]">
                {pillar.stat}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                {pillar.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
