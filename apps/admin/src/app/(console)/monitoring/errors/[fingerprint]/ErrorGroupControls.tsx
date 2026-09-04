"use client";

import { Button } from "@/components/ui";
import { setErrorGroupStatus } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ErrorGroupControls({ fingerprint }: { fingerprint: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function set(status: "acknowledged" | "resolved" | "ignored" | "open") {
    setMsg(null);
    start(async () => {
      const res = await setErrorGroupStatus({ fingerprint, status });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => set("acknowledged")}
      >
        Acknowledge
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => set("resolved")}
      >
        Resolve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => set("ignored")}
      >
        Ignore
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => set("open")}
      >
        Reopen
      </Button>
      {msg ? (
        <span className="text-xs text-muted-foreground">{msg}</span>
      ) : null}
    </div>
  );
}
