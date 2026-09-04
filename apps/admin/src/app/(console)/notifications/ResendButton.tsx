"use client";

import { Button } from "@/components/ui";
import { resendNotification } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ResendButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            const res = await resendNotification({ id });
            setMsg(
              res.message ?? (res.status === 200 ? "Re-sent." : "Failed."),
            );
            if (res.status === 200) router.refresh();
          });
        }}
      >
        {pending ? "Re-sending…" : "Re-send to recipient"}
      </Button>
      {msg ? (
        <span className="text-xs text-muted-foreground">{msg}</span>
      ) : null}
    </div>
  );
}
