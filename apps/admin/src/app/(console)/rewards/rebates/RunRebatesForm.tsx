"use client";

import { Button } from "@/components/ui";
import { runMonthlyRebates } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";

/**
 * Runs the rebates for one month now. The cron already does last month on
 * the 3rd; this is for a shadow preview or a re-run after fixing a failure.
 */
export function RunRebatesForm({
  months,
  editable,
  shadow,
}: {
  months: { value: string; label: string }[];
  editable: boolean;
  shadow: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(months[0]?.value ?? "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!editable) return null;
  if (!open) {
    return (
      <div className="space-y-1">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Run a month now…
        </Button>
        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-2 rounded border border-border p-3">
      <p className="text-xs text-muted-foreground">
        {shadow
          ? "Shadow mode is on: decisions are recorded, no credit is posted."
          : "Shadow mode is off: rebates that pass every check are paid as promotion credit."}{" "}
        Events already decided are skipped.
      </p>
      <label className="block text-xs">
        <span className="text-muted-foreground">Events that ended in</span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className={`${input} mt-0.5`}
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? (required, audited)"
        rows={2}
        className={input}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          disabled={pending || reason.trim().length < 3 || !period}
          onClick={() =>
            start(async () => {
              const res = await runMonthlyRebates({
                periodStart: period,
                reason: reason.trim(),
              });
              setMsg(res.message ?? null);
              if (res.status === 200) {
                setOpen(false);
                setReason("");
                router.refresh();
              }
            })
          }
        >
          {pending ? "Running…" : "Run"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
