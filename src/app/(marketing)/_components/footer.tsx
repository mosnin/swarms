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
    <footer className="relative mt-24 overflow-hidden border-t border-neutral-100">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3">
          <Link href="/" className="inline-flex items-center" aria-label="Swarms — home">
            <Image src="/logo.png" alt="Swarms" width={686} height={160} className="h-6 w-auto" />
          </Link>
          <p className="max-w-xs text-sm text-neutral-500">
            An on-demand labor force for your AI agent. Rent GPU by the second, hard budget ceilings, every
            run metered and auditable.
          </p>
        </div>

        {COLS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-neutral-900">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-neutral-500 transition-colors hover:text-neutral-950">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Oversized wordmark, clipped at the container edge — a quiet signature. */}
      <div aria-hidden="true" className="pointer-events-none relative h-20 select-none overflow-hidden sm:h-28 md:h-32">
        <p className="absolute inset-x-0 top-0 whitespace-nowrap text-center font-display text-[16vw] font-semibold leading-none tracking-tighter text-neutral-50 sm:text-[11vw] md:text-[9vw]">
          swarms
        </p>
      </div>

      <div className="relative border-t border-neutral-100 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-neutral-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Swarms — Agent Capability Cloud.</p>
          <p>Built for autonomous agents.</p>
        </div>
      </div>
    </footer>
  );
}
