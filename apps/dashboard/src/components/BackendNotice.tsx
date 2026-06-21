import { cn } from "../lib/utils.js";

export function BackendNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100",
        className,
      )}
    >
      <p className="font-medium">Control plane offline</p>
      <p className="mt-1 text-amber-200/90">
        Run{" "}
        <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-xs">
          pnpm dev:control-plane
        </code>{" "}
        to load live benchmark runs. Tabs with static JSON (axe vs Ramp, Auto-fix, precision)
        still work with verified demo data.
      </p>
    </div>
  );
}
