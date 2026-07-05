import { cn } from "@/lib/utils";

/**
 * DataTable primitives — a bordered, horizontally-scrollable surface with a
 * muted header and hover-highlighted rows. Wrapping the table in its own
 * overflow container keeps wide tables from breaking the page layout on mobile.
 */
export function DataTable({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
      {children}
    </thead>
  );
}

export function TH({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn("whitespace-nowrap px-4 py-2.5 font-medium", className)}>{children}</th>;
}

export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <tr className={cn("border-b transition-colors last:border-0 hover:bg-muted/40", className)}>
      {children}
    </tr>
  );
}

export function TD({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <td className={cn("px-4 py-2.5 align-middle", className)}>{children}</td>;
}

/** Full-width empty row for tables with no data. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
