"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { FeatureIcon } from "@/app/(marketing)/_components/feature-icons";
import { ACCENT, FEATURES, USE_CASES, type SitePage } from "@/app/(marketing)/_lib/site-map";

type MenuKey = "features" | "use-cases" | null;

const PANEL_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
/** Grace period before a hover-out closes the panel — forgiving diagonals. */
const CLOSE_DELAY_MS = 140;

export function MarketingNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<MenuKey>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close everything on navigation and on Escape.
  useEffect(() => {
    setMenu(null);
    setMobileOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
  }, []);
  /**
   * Hover intent: the first open waits ~90ms so a cursor passing across the
   * nav never flashes a panel; switching between already-open menus is
   * instant, the standard mega-menu feel.
   */
  const openMenu = useCallback(
    (key: Exclude<MenuKey, null>) => {
      clearTimers();
      setMenu((current) => {
        if (current !== null) return key;
        openTimer.current = setTimeout(() => setMenu(key), 90);
        return current;
      });
    },
    [clearTimers],
  );
  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setMenu(null), CLOSE_DELAY_MS);
  }, [clearTimers]);
  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const sectionActive = (pages: SitePage[]) => pages.some((p) => pathname.startsWith(p.href));

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:pt-4" onMouseLeave={scheduleClose}>
      <nav
        onMouseEnter={cancelClose}
        className={`mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-full border py-1.5 pl-2 pr-1.5 backdrop-blur-xl transition-all duration-300 ${
          scrolled || menu
            ? "border-neutral-200 bg-white/95 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_30px_-12px_rgb(0_0_0/0.12)]"
            : "border-transparent bg-white/70 shadow-none"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center rounded-full px-2.5 py-1" aria-label="Swarms — home">
          <Image src="/logo.png" alt="Swarms" width={686} height={160} priority className="h-6 w-auto" />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          <MenuButton
            label="Features"
            open={menu === "features"}
            active={sectionActive(FEATURES)}
            onHover={() => openMenu("features")}
            onClick={() => setMenu((m) => (m === "features" ? null : "features"))}
          />
          <MenuButton
            label="Use cases"
            open={menu === "use-cases"}
            active={sectionActive(USE_CASES)}
            onHover={() => openMenu("use-cases")}
            onClick={() => setMenu((m) => (m === "use-cases" ? null : "use-cases"))}
          />
          {[
            { href: "/pricing", label: "Pricing" },
            { href: "/docs", label: "Docs" },
            { href: "/company", label: "Company" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onMouseEnter={scheduleClose}
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
            className="group rounded-full bg-neutral-950 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.97]"
          >
            Get started
            <span className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
              →
            </span>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
          className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 active:scale-95 md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {/* Desktop mega panel */}
      <AnimatePresence>
        {menu && (
          <motion.div
            key={menu}
            initial={{ opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985 }}
            transition={PANEL_TRANSITION}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="absolute inset-x-0 top-full hidden justify-center px-3 pt-2 md:flex"
          >
            <div className="w-full max-w-3xl origin-top overflow-hidden rounded-2xl border border-neutral-200 bg-white/95 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-20px_rgb(0_0_0/0.18)] backdrop-blur-xl">
              <MegaPanel pages={menu === "features" ? FEATURES : USE_CASES} />
              <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/60 px-5 py-3">
                {menu === "features" ? (
                  <>
                    <p className="text-xs text-neutral-500">
                      <span className="mr-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700">New</span>
                      Hosted agents — deploy a persistent Hermes agent in one click.
                    </p>
                    <Link href="/features/hosted-agents" className="group whitespace-nowrap text-xs font-medium text-neutral-950">
                      See how
                      <span className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-neutral-500">Not sure where to start? Spawn one agent from the docs in five minutes.</p>
                    <Link href="/docs" className="group whitespace-nowrap text-xs font-medium text-neutral-950">
                      Quickstart
                      <span className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 max-h-[75vh] max-w-5xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-lg backdrop-blur-xl md:hidden"
          >
            <MobileSection title="Features" pages={FEATURES} onNavigate={() => setMobileOpen(false)} />
            <MobileSection title="Use cases" pages={USE_CASES} onNavigate={() => setMobileOpen(false)} />
            {[
              { href: "/pricing", label: "Pricing" },
              { href: "/docs", label: "Docs" },
              { href: "/company", label: "Company" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(l.href) ? "bg-neutral-100 text-neutral-950" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-1 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-2">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-center text-sm font-medium text-neutral-800"
              >
                Sign in
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
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

function MenuButton({
  label,
  open,
  active,
  onHover,
  onClick,
}: {
  label: string;
  open: boolean;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onClick}
      aria-expanded={open}
      className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        open || active ? "bg-neutral-100 text-neutral-950" : "text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-950"
      }`}
    >
      {label}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        aria-hidden
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function MegaPanel({ pages }: { pages: SitePage[] }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-2.5">
      {pages.map((page, i) => {
        const accent = ACCENT[page.accent];
        return (
          <motion.div
            key={page.slug}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.03 + i * 0.025, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link
              href={page.href}
              className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-neutral-50"
            >
              <span
                className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${accent.bg} ${accent.text} transition-transform duration-200 group-hover:scale-105`}
              >
                <FeatureIcon slug={page.slug} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-medium text-neutral-950">
                  {page.name}
                  <span
                    className="translate-x-0 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-60"
                    aria-hidden
                  >
                    →
                  </span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-neutral-500">{page.tagline}</span>
              </span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

function MobileSection({
  title,
  pages,
  onNavigate,
}: {
  title: string;
  pages: SitePage[];
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-neutral-100 pb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
      >
        {title}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {pages.map((page) => {
              const accent = ACCENT[page.accent];
              return (
                <Link
                  key={page.slug}
                  href={page.href}
                  onClick={onNavigate}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${accent.bg} ${accent.text}`}>
                    <FeatureIcon slug={page.slug} className="h-3.5 w-3.5" />
                  </span>
                  {page.name}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
