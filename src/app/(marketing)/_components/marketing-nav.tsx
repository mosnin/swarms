"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/about", label: "About" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:pt-4">
      <nav
        className={`mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-full border py-1.5 pl-2 pr-1.5 backdrop-blur-xl transition-all duration-300 ${
          scrolled
            ? "border-neutral-200 bg-white/95 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_30px_-12px_rgb(0_0_0/0.12)]"
            : "border-transparent bg-white/70 shadow-none"
        }`}
      >
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center rounded-full px-2.5 py-1" aria-label="Swarms — home">
          <Image src="/logo.png" alt="Swarms" width={686} height={160} priority className="h-6 w-auto" />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive(l.href) ? "bg-neutral-100 text-neutral-950" : "text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-950"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-1.5 md:flex">
          <Link
            href="/login"
            className="rounded-full px-3.5 py-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-950"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-neutral-950 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.97]"
          >
            Get started
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 active:scale-95 md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 max-w-5xl rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-lg backdrop-blur-xl md:hidden"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(l.href) ? "bg-neutral-100 text-neutral-950" : "text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-1 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-center text-sm font-medium text-neutral-800"
              >
                Sign in
              </Link>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-neutral-950 px-3 py-2 text-center text-sm font-medium text-white"
              >
                Get started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
