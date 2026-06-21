import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
        secondary:
          "border-transparent bg-[var(--color-muted)] text-[var(--color-foreground)]",
        outline: "border-[var(--color-border)] text-[var(--color-foreground)]",
        critical:
          "border-transparent bg-red-500/15 text-red-300",
        serious:
          "border-transparent bg-orange-500/15 text-orange-300",
        moderate:
          "border-transparent bg-yellow-500/15 text-yellow-200",
        minor:
          "border-transparent bg-blue-500/15 text-blue-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
