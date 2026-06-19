import { Gauge } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs.js";
import { LiveRunPage, LiveRunSummaryStrip } from "./pages/LiveRunPage.js";
import { PRCardPage } from "./pages/PRCardPage.js";
import { ScoresPage } from "./pages/ScoresPage.js";

export function App() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Ramp Dashboard</h1>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Accessibility audit · score · fix pipeline
              </p>
            </div>
          </div>
          <LiveRunSummaryStrip />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live">Live Run</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            <TabsTrigger value="pr">PR Card</TabsTrigger>
          </TabsList>

          <TabsContent value="live">
            <LiveRunPage />
          </TabsContent>
          <TabsContent value="scores">
            <ScoresPage />
          </TabsContent>
          <TabsContent value="pr">
            <PRCardPage />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
