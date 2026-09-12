"use client";

import { Button, Card } from "@/components/ui";
import { decideFieldOpsContent, runFieldOpsStipends } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input = "rounded border border-border bg-background px-2 py-1.5 text-sm";

/** Decide a deliverable in the lead's place (fieldops.verify, audited). */
export function ContentDecision({
  campaignId,
  submissionId,
}: {
  campaignId: string;
  submissionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const decide = (decision: "approved" | "rejected") =>
    start(async () => {
      setMsg(null);
      const res = await decideFieldOpsContent({
        campaignId,
        submissionId,
        decision,
        note: note.trim() || null,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        className={`${input} min-w-0 flex-1`}
        placeholder="Note (required to reject)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" onClick={() => decide("approved")} disabled={pending}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => decide("rejected")}
        disabled={pending || note.trim().length < 3}
      >
        Reject
      </Button>
      {msg ? (
        <p className="w-full text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </div>
  );
}

/**
 * Authorises one month of stipends. Idempotent per member per month, so
 * running it twice is safe; it simply reports that nothing was added.
 */
export function StipendRun({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [reason, setReason] = useState("Monthly stipend run");
  const [msg, setMsg] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setMsg(null);
      const res = await runFieldOpsStipends({
        campaignId,
        periodStart: `${month}-01`,
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  return (
    <Card className="flex flex-wrap items-center gap-2 p-4">
      <div>
        <p className="text-sm font-semibold">Monthly stipends</p>
        <p className="text-xs text-muted-foreground">
          Adds an approved commission for each active team lead and content
          creator, at whatever the live stipend rules pay. Nobody is paid twice
          for the same month.
        </p>
      </div>
      <input
        type="month"
        className={input}
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      />
      <input
        className={`${input} min-w-48 flex-1`}
        placeholder="Reason (audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button onClick={run} disabled={pending || reason.trim().length < 3}>
        Run stipends
      </Button>
      {msg ? (
        <p className="w-full text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </Card>
  );
}
