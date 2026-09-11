"use client";

import { Button } from "@/components/ui";
import {
  publishFieldOpsRuleVersion,
  setFieldOpsRuleActive,
} from "@/server/actions";
import type {
  FieldOpsActivityKey,
  FieldOpsCommissionRule,
} from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";

/** Make a version live, or switch the activity off. */
export function ActivateRuleButton({
  activityKey,
  ruleId,
  label,
  editable,
  campaignId = null,
}: {
  activityKey: FieldOpsActivityKey;
  ruleId: string | null;
  label: string;
  editable: boolean;
  campaignId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!editable) return null;
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="min-w-[220px] space-y-1">
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
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            start(async () => {
              const res = await setFieldOpsRuleActive({
                campaignId,
                activityKey,
                ruleId,
                reason: reason.trim(),
              });
              setMsg(res.message ?? null);
              if (res.status === 200) {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : "Confirm"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

/** Publishes the next version of an activity's rule, switched off. */
export function NewRuleVersionForm({
  latest,
  editable,
  campaignId = null,
}: {
  latest: FieldOpsCommissionRule;
  editable: boolean;
  campaignId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((latest.amountMinor / 100).toFixed(2));
  const [eligibility, setEligibility] = useState(
    JSON.stringify(latest.eligibility, null, 2),
  );
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!editable) return null;
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        New version…
      </Button>
    );
  }

  const submit = () =>
    start(async () => {
      setMsg(null);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(eligibility || "{}");
      } catch {
        setMsg("Eligibility must be valid JSON.");
        return;
      }
      const res = await publishFieldOpsRuleVersion({
        campaignId,
        activityKey: latest.activityKey,
        amountMinor: Math.round(Number(amount) * 100),
        currency: latest.currency,
        eligibility: parsed,
        note: note.trim(),
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="mt-2 space-y-2 rounded border border-border p-3">
      <p className="text-xs text-muted-foreground">
        Starts from v{latest.version}
        {campaignId ? " (this campaign only)" : ""}. Amount in {latest.currency}
        .
      </p>
      <label className="block text-xs">
        <span className="text-muted-foreground">
          Amount ({latest.currency})
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className={`${input} w-32`}
        />
      </label>
      <label className="block text-xs">
        <span className="text-muted-foreground">
          Eligibility (JSON: holding_days, min_photos,
          require_owner_phone_verified, require_inside_territory,
          max_distance_m, min_description_chars, require_opening_hours,
          require_contact, min_days_before_start, release_policy)
        </span>
        <textarea
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value)}
          rows={5}
          className={`${input} font-mono text-xs`}
        />
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What changed? (shown with the version)"
        className={input}
      />
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
          disabled={
            pending || note.trim().length < 3 || reason.trim().length < 3
          }
          onClick={submit}
        >
          {pending ? "Publishing…" : "Publish (switched off)"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
