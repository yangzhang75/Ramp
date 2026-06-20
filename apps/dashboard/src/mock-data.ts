import type { Finding, Score } from "@ramp/shared";

export const mockBeforeScore: Score = {
  runId: "run-demo-001",
  phase: "before",
  score: 60,
  critical: 1,
  serious: 3,
  moderate: 1,
  minor: 0,
  totalViolations: 5,
  computedAt: "2026-06-19T10:00:00.000Z",
};

export const mockAfterScore: Score = {
  runId: "run-demo-001",
  phase: "after",
  score: 96,
  critical: 0,
  serious: 0,
  moderate: 1,
  minor: 0,
  totalViolations: 1,
  computedAt: "2026-06-19T10:12:00.000Z",
};

export const mockFindings: Finding[] = [
  {
    id: "finding-1",
    runId: "run-demo-001",
    type: "missing_alt_text",
    severity: "serious",
    wcagRule: "1.1.1",
    sourceFile: "src/components/HeroBanner.tsx",
    line: 18,
    confidence: 0.94,
    autoFixable: true,
    evidence:
      'Screen reader: unlabeled image "hero-banner.jpg". Node: <img src="/hero-banner.jpg" class="w-full" />',
  },
  {
    id: "finding-2",
    runId: "run-demo-001",
    type: "icon_button_accessible_names",
    severity: "critical",
    wcagRule: "4.1.2",
    sourceFile: "src/components/Navbar.tsx",
    line: 42,
    confidence: 0.91,
    autoFixable: true,
    evidence:
      'Screen reader: "button" with no accessible name. Node: <button class="icon-btn"><SearchIcon /></button>',
  },
  {
    id: "finding-3",
    runId: "run-demo-001",
    type: "low_color_contrast",
    severity: "moderate",
    wcagRule: "1.4.3",
    sourceFile: "src/components/Button.tsx",
    line: 7,
    confidence: 0.88,
    autoFixable: true,
    evidence:
      "Contrast ratio 2.8:1 (required 4.5:1). Foreground #999999 on background #ffffff.",
  },
  {
    id: "finding-4",
    runId: "run-demo-001",
    type: "missing_form_labels",
    severity: "serious",
    wcagRule: "1.3.1",
    sourceFile: "src/components/LoginForm.tsx",
    line: 24,
    confidence: 0.9,
    autoFixable: true,
    evidence:
      'Screen reader: "edit text" with no label. Node: <input type="email" placeholder="Email" />',
  },
  {
    id: "finding-5",
    runId: "run-demo-001",
    type: "missing_landmarks",
    severity: "minor",
    wcagRule: "1.3.1",
    sourceFile: "src/pages/Dashboard.tsx",
    line: 3,
    confidence: 0.76,
    autoFixable: false,
    evidence:
      "Page missing main landmark. Screen reader cannot skip directly to primary content.",
  },
];

export interface ModeMetrics {
  mode: "naked" | "harness";
  recall: number;
  precision: number;
}

export const mockModeMetrics: ModeMetrics[] = [
  { mode: "naked", recall: 0.31, precision: 0.45 },
  { mode: "harness", recall: 0.78, precision: 0.85 },
];

export interface LeaderboardRow {
  model: string;
  mode: "naked" | "harness";
  recall: number;
  precision: number;
  tasks: number;
}

export const mockLeaderboard: LeaderboardRow[] = [
  {
    model: "Claude Sonnet",
    mode: "harness",
    recall: 0.78,
    precision: 0.85,
    tasks: 24,
  },
  {
    model: "GPT-4o",
    mode: "harness",
    recall: 0.71,
    precision: 0.8,
    tasks: 24,
  },
  {
    model: "Gemini 2.0 Flash",
    mode: "harness",
    recall: 0.65,
    precision: 0.74,
    tasks: 24,
  },
  {
    model: "Claude Sonnet",
    mode: "naked",
    recall: 0.34,
    precision: 0.48,
    tasks: 24,
  },
  {
    model: "GPT-4o",
    mode: "naked",
    recall: 0.31,
    precision: 0.45,
    tasks: 24,
  },
  {
    model: "Gemini 2.0 Flash",
    mode: "naked",
    recall: 0.28,
    precision: 0.41,
    tasks: 24,
  },
];

export const mockPullRequest = {
  repo: "yangzhang75/Ramp",
  title: "Improve accessibility of bad.html — Ramp verified WCAG fixes",
  url: "https://github.com/yangzhang75/Ramp/pull/7",
  branch: "ramp/fix-bad-html-demo",
  diff: `diff --git a/src/components/HeroBanner.tsx b/src/components/HeroBanner.tsx
index 1a2b3c4..5d6e7f8 100644
--- a/src/components/HeroBanner.tsx
+++ b/src/components/HeroBanner.tsx
@@ -15,7 +15,7 @@ export function HeroBanner() {
   return (
     <section aria-label="Hero">
-      <img src="/hero-banner.jpg" className="w-full" />
+      <img src="/hero-banner.jpg" alt="Team collaborating in a bright office" className="w-full" />
     </section>
   );
 }
diff --git a/src/components/Navbar.tsx b/src/components/Navbar.tsx
index 9aa1bb2..cc3dd44 100644
--- a/src/components/Navbar.tsx
+++ b/src/components/Navbar.tsx
@@ -39,7 +39,7 @@ export function Navbar() {
       <Logo />
-      <button className="icon-btn"><SearchIcon /></button>
+      <button className="icon-btn" aria-label="Search"><SearchIcon /></button>
     </nav>
   );
 }`,
};
