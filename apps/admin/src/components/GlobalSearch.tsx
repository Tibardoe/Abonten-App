"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function GlobalSearch() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = q.trim();
        if (t.length >= 2) router.push(`/search?q=${encodeURIComponent(t)}`);
      }}
      className="flex items-center"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search users, events, places, transactions, reports…"
        className="h-8 w-72 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </form>
  );
}
