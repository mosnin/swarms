"use client";

import { useEffect, useState } from "react";

export function DocsToc({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="sticky top-28 hidden w-44 shrink-0 lg:block">
      <ul className="space-y-1 border-l border-neutral-100">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`block border-l-2 py-1 pl-4 text-sm transition-colors ${
                active === item.id
                  ? "border-violet-500 font-medium text-neutral-950"
                  : "border-transparent text-neutral-400 hover:text-neutral-700"
              }`}
              style={{ marginLeft: "-1px" }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
