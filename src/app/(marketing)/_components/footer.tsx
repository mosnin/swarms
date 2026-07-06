import Image from "next/image";
import Link from "next/link";

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Quickstart" },
      { href: "/docs#api", label: "API reference" },
      { href: "/docs#mcp", label: "MCP" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "mailto:hello@swarms.dev", label: "Contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t bg-background/40">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3">
          <Link href="/" className="inline-flex items-center" aria-label="Swarms — home">
            <Image src="/logo.png" alt="Swarms" width={686} height={160} className="h-6 w-auto" />
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
            An on-demand labor force for your AI agent. Rent GPU by the second, hard budget ceilings,
            every run metered and auditable.
          </p>
        </div>

        {COLS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Swarms — Agent Capability Cloud.</p>
          <p>Built for autonomous agents.</p>
        </div>
      </div>
    </footer>
  );
}
