"use client";
import { useEffect, useState } from "react";

export function Toc({ items }: { items: [string, string][] }) {
  const [active, setActive] = useState(items[0][0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => {
        const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setActive(v.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    items.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [items]);
  return (
    <nav className="toc" aria-label="On this page">
      {items.map(([id, label]) => (
        <a key={id} href={`#${id}`} aria-current={active === id ? "true" : undefined}>{label}</a>
      ))}
    </nav>
  );
}
