import Link from "next/link";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/skills", label: "Skills" },
  { href: "/jobs", label: "Jobs" },
  { href: "/swarms", label: "Swarms" },
  { href: "/connectors", label: "Connectors" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/creator/revenue", label: "Creator revenue" },
  { href: "/approvals", label: "Approvals" },
  { href: "/payments", label: "Payments" },
  { href: "/usage", label: "Usage" },
  { href: "/audit", label: "Audit" },
  { href: "/settings/budgets", label: "Budgets" },
  { href: "/settings/policies", label: "Policies" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/members", label: "Members" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-muted/30 p-4">
        <Link href="/dashboard" className="mb-6 block text-lg font-bold">
          Hermes Cloud
        </Link>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
