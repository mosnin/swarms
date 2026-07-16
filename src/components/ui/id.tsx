"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Truncated identifier with click-to-copy. Renders the first 12 characters
 * (full value in the title tooltip) and copies the full id to the clipboard.
 * Pass `href` to keep the id navigable — a copy button is rendered beside the
 * link so navigation and copying never fight over the same click.
 */
export function Id({ value, href, className }: { value: string; href?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — leave the id visible.
    }
  }

  const short = value.length > 12 ? `${value.slice(0, 12)}…` : value;

  if (href) {
    return (
      <span className={cn("inline-flex items-center gap-1 font-mono text-xs", className)}>
        <Link href={href} title={value} className="hover:underline">
          {short}
        </Link>
        <button
          type="button"
          onClick={copy}
          title={copied ? "Copied" : `Copy ${value}`}
          aria-label={copied ? "Copied" : `Copy id ${value}`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      aria-label={copied ? "Copied" : `Copy id ${value}`}
      className={cn("font-mono text-xs hover:underline", className)}
    >
      {copied ? <span className="text-muted-foreground">copied</span> : short}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
