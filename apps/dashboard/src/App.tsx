import { useState } from "react";
import { Gauge, Github } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs.js";
import { AutoFixResultsPage } from "./pages/AutoFixResultsPage.js";
import { HowItWorksPage } from "./pages/HowItWorksPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { LiveRunPage, LiveRunSummaryStrip } from "./pages/LiveRunPage.js";
import { PRCardPage } from "./pages/PRCardPage.js";
import { ScoresPage } from "./pages/ScoresPage.js";
import { VsAxePage } from "./pages/VsAxePage.js";

const GITHUB_URL = "https://github.com/yangzhang75/Ramp";

export function App() {
  const [tab, setTab] = useState("home");

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={() => setTab("home")}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Ramp</h1>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Audit · fix · PR
              </p>
            </div>
          </button>
          <div className="flex items-center gap-4">
            <LiveRunSummaryStrip />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium transition hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)] sm:inline-flex"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex h-auto flex-wrap gap-1">
            <TabsTrigger value="home">Home</TabsTrigger>
            <TabsTrigger value="vs-axe">axe vs Ramp</TabsTrigger>
            <TabsTrigger value="auto-fix">Auto-fix</TabsTrigger>
            <TabsTrigger value="how">How it works</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            <TabsTrigger value="live">Live Run</TabsTrigger>
            <TabsTrigger value="pr">PR Card</TabsTrigger>
          </TabsList>

          <TabsContent value="home">
            <LandingPage onExploreDemo={() => setTab("vs-axe")} />
          </TabsContent>
          <TabsContent value="vs-axe">
            <VsAxePage />
          </TabsContent>
          <TabsContent value="auto-fix">
            <AutoFixResultsPage />
          </TabsContent>
          <TabsContent value="how">
            <HowItWorksPage />
          </TabsContent>
          <TabsContent value="scores">
            <ScoresPage />
          </TabsContent>
          <TabsContent value="live">
            <LiveRunPage />
          </TabsContent>
          <TabsContent value="pr">
            <PRCardPage />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted-foreground)]">
        <p>Playwright · axe-core · Claude Code · Sentry · Octokit</p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[var(--color-primary)] hover:underline"
        >
          github.com/yangzhang75/Ramp
        </a>
      </footer>
    </div>
  );
}
