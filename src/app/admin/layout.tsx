import { AccessDenied } from "@/app/admin/_components/access-denied";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import { tryCurrentPlatformAdmin } from "@/modules/admin/current";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Swarms", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await tryCurrentPlatformAdmin();
  if (!admin) return <AccessDenied />;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto min-h-screen max-w-[1600px] sm:p-3">
        <div className="flex min-h-screen flex-col overflow-hidden bg-background sm:min-h-[calc(100vh-1.5rem)] sm:rounded-2xl sm:border sm:shadow-[0_1px_3px_rgb(0_0_0/0.04),0_8px_40px_-12px_rgb(0_0_0/0.10)] lg:flex-row">
          <AdminSidebar email={admin.email} />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Persistent notice: every read and write on this surface is audited. */}
            <div className="flex items-center gap-2 border-b bg-amber-500/[0.06] px-4 py-2 text-[12px] text-amber-800 dark:text-amber-400 sm:px-8">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                <path d="M14 3v5h5M8 13h8M8 17h5" />
              </svg>
              Platform admin console — every action here is recorded to the append-only admin audit log.
            </div>
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="animate-page-in mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
