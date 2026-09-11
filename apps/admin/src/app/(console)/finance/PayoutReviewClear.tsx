"use client";

import { Button } from "@/components/ui";
import { clearPayoutReview } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// A payout held because a large share of an event's sales was paid with
// Abonten Credit can't be completed until someone confirms those sales are
// genuine. finance.payout + step-up, re-checked server-side; the note is
// audited.
export function PayoutReviewClear({
  payoutId,
  stepUpFresh,
}: {
  payoutId: string;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Clear review…
      </Button>
    );
  }

  return (
    <div className="min-w-[240px] space-y-1.5 rounded border border-border bg-card p-2">
      {!stepUpFresh ? (
        <p className="text-xs text-destructive">
          Confirm identity in Admin Settings first.
        </p>
      ) : null}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you check? e.g. buyers are unrelated to the organizer (required, audited)"
        rows={3}
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={pending || !stepUpFresh || note.trim().length < 10}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const res = await clearPayoutReview({
                payoutId,
                reason: note.trim(),
              });
              setMsg(res.message ?? null);
              if (res.status === 200) {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Clearing…" : "Clear review"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
