"use client";

import { useState } from "react";

export function CodeBlock({ label, children }: { label?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — the code is still selectable by hand.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
        <span className="font-mono text-[11px] text-neutral-400">{label ?? "shell"}</span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[11px] text-neutral-400 transition-colors hover:text-neutral-700"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-neutral-600">
        <code>{children}</code>
      </pre>
    </div>
  );
}
