import { cn } from "../lib/utils.js";

export function ArchitectureDiagram() {
  const box =
    "rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/80 px-3 py-2 text-center text-xs leading-snug backdrop-blur sm:text-sm";
  const subgraph =
    "rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-muted)]/30 p-4 sm:p-5";
  const arrow = "text-[var(--color-muted-foreground)] text-lg shrink-0";

  return (
    <div className="overflow-x-auto">
      <div className="mx-auto min-w-[720px] max-w-4xl space-y-4 p-2">
        <div className="flex justify-center">
          <div className={cn(box, "max-w-xs border-dashed")}>Frontend repo / URL</div>
        </div>
        <div className="flex justify-center text-[var(--color-primary)]">↓</div>

        <div className={subgraph}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            Control Plane
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className={box}>POST /audit · /benchmark</div>
            <span className={arrow}>↔</span>
            <div className={box}>SQLite · runs · findings</div>
          </div>
        </div>

        <div className="flex justify-center text-[var(--color-primary)]">↓</div>

        <div className={subgraph}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            Harness
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className={box}>Playwright page</div>
            <span className={arrow}>→</span>
            <div className={box}>axe · a11y tree · screen reader · contrast</div>
            <span className={arrow}>→</span>
            <div className={cn(box, "border-[var(--color-primary)]/40")}>LLM audit agent</div>
          </div>
        </div>

        <div className="flex justify-center text-[var(--color-primary)]">↓</div>

        <div className={subgraph}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">
            Fix Loop
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className={box}>fork @ base commit</div>
            <span className={arrow}>→</span>
            <div className={box}>Claude Code fix</div>
            <span className={arrow}>→</span>
            <div className={box}>axe verify · score</div>
            <span className={arrow}>→</span>
            <div className={cn(box, "border-[var(--color-primary)]/40")}>GitHub PR</div>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <div className={cn(box, "border-[var(--color-primary)]/30 text-[var(--color-primary)]")}>
            merge-ready pull request
          </div>
        </div>

        <p className="pt-2 text-center text-xs text-[var(--color-muted-foreground)]">
          Sentry monitors control-plane, harness, and fix loop
        </p>
      </div>
    </div>
  );
}
