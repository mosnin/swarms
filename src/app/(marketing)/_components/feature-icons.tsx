/**
 * Icon set for features and use cases — one visual voice: 24px grid, 1.75
 * stroke, round caps, geometric forms. Keyed by site-map slug so the mega
 * menu, feature pages, and footers all pull the same mark.
 */

export function FeatureIcon({ slug, className }: { slug: string; className?: string }) {
  const path = PATHS[slug] ?? PATHS.spawn;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      {path}
    </svg>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  // A single worker springing from a point.
  spawn: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21" />
      <path d="M5.8 5.8l3 3M15.2 15.2l3 3M18.2 5.8l-3 3M8.8 15.2l-3 3" opacity="0.45" />
    </>
  ),
  // Fan-out to three, merging back.
  swarms: (
    <>
      <circle cx="4.5" cy="12" r="1.8" />
      <circle cx="12" cy="5.5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="18.5" r="1.8" />
      <circle cx="19.5" cy="12" r="1.8" />
      <path d="M6.2 11 10.2 6.4M6.2 12h4M6.2 13l4 4.6M13.8 6.4l4 4.6M13.8 12h4M13.8 17.6l4-4.6" opacity="0.55" />
    </>
  ),
  // A house with a pulse — the agent that lives here.
  "hosted-agents": (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
      <path d="M8.5 14h2l1.2-2.6 1.6 4.4 1.2-1.8h1" />
    </>
  ),
  // A gauge pinned under a ceiling.
  budgets: (
    <>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <path d="M12 15l3.6-3.6" />
      <circle cx="12" cy="15" r="1.4" />
      <path d="M3.5 19.5h17" opacity="0.55" />
    </>
  ),
  // Shield with a keyhole of process.
  governance: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="M9.2 11.8l2 2 3.8-4" />
    </>
  ),
  // Clock hands meeting a spark.
  automation: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
      <path d="M19.5 4.5l1 1M4.5 4.5l-1 1" opacity="0.45" />
    </>
  ),
  // Use cases.
  research: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
      <path d="M8.5 11h5M11 8.5v5" opacity="0.55" />
    </>
  ),
  content: (
    <>
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 9h8M8 13h8M8 17h5" opacity="0.55" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" />
      <path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" opacity="0.55" />
    </>
  ),
  engineering: (
    <>
      <path d="m8 8-4.5 4L8 16M16 8l4.5 4L16 16" />
      <path d="M13.5 5.5l-3 13" opacity="0.55" />
    </>
  ),
  simulations: (
    <>
      <circle cx="8" cy="8.5" r="2.6" />
      <circle cx="16" cy="8.5" r="2.6" opacity="0.55" />
      <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
      <path d="M13.6 15.1A4.5 4.5 0 0 1 20.5 19" opacity="0.55" />
    </>
  ),
  operations: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M7.5 15.5 11 11l3 2.5 4.5-6" />
      <circle cx="18.5" cy="7.5" r="1.2" opacity="0.55" />
    </>
  ),
};
