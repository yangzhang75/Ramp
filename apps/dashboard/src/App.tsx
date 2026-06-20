import { Gauge } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs.js";
import { AutoFixResultsPage } from "./pages/AutoFixResultsPage.js";
import { HowItWorksPage } from "./pages/HowItWorksPage.js";
import { LiveRunPage, LiveRunSummaryStrip } from "./pages/LiveRunPage.js";
import { PRCardPage } from "./pages/PRCardPage.js";
import { ScoresPage } from "./pages/ScoresPage.js";
import { VsAxePage } from "./pages/VsAxePage.js";

export function App() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Ramp Dashboard</h1>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Demo · audit · fix · PR
              </p>
            </div>
          </div>
          <LiveRunSummaryStrip />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Tabs defaultValue="vs-axe">
          <TabsList className="mb-2 flex h-auto flex-wrap gap-1">
            <TabsTrigger value="vs-axe">axe vs Ramp</TabsTrigger>
            <TabsTrigger value="auto-fix">Auto-fix</TabsTrigger>
            <TabsTrigger value="how">How it works</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            <TabsTrigger value="live">Live Run</TabsTrigger>
            <TabsTrigger value="pr">PR Card</TabsTrigger>
          </TabsList>

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
    </div>
  );
}
