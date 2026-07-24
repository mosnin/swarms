/** A numbered, anchorable docs section — the shared building block of every page. */
export function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 space-y-4 border-t border-neutral-100 pt-10">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm text-neutral-300">{n}</span>
        <h2 className="text-xl font-medium tracking-tight text-neutral-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** Standard body paragraph tone used across the docs. */
export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-neutral-500">{children}</p>;
}

/** Inline code token. */
export function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[13px] text-neutral-700">
      {children}
    </code>
  );
}
