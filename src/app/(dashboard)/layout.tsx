import { CommandPalette } from "@/app/(dashboard)/_components/command-palette";
import { Sidebar } from "@/app/(dashboard)/_components/sidebar";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1600px] sm:p-3">
        {/* Floating white app panel — full-bleed on mobile, inset + rounded on sm+. */}
        <div className="flex min-h-screen flex-col overflow-hidden bg-background sm:min-h-[calc(100vh-1.5rem)] sm:rounded-2xl sm:border sm:shadow-[0_1px_3px_rgb(0_0_0/0.04),0_8px_40px_-12px_rgb(0_0_0/0.10)] lg:flex-row">
          <CommandPalette />
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="animate-page-in mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
