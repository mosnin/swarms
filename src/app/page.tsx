import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Hermes Cloud</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          A paid execution layer for autonomous agents. Rent skills, connectors, and sandboxed agent
          workers — metered, budgeted, audited.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button>Read the docs</Button>
        <Button variant="outline">API status</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Foundation scaffold — see <code>docs/</code> for the technical plan.
      </p>
    </main>
  );
}
