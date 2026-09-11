"use client";

import { Button } from "@/components/ui";
import {
  publishRewardRuleVersion,
  setRewardRuleActive,
} from "@/server/actions";
import type { RewardRuleSummary } from "@abonten/types/rewards";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type RuleKey =
  | "event_referral"
  | "friend_referral_referrer"
  | "friend_referral_referee"
  | "organizer_rebate"
  | "venue_rebate"
  | "organizer_milestone";

const input =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";

/** Make a version live, or switch the rule off. */
export function ActivateRuleButton({
  ruleKey,
  ruleId,
  label,
  editable,
}: {
  ruleKey: string;
  ruleId: string | null;
  label: string;
  editable: boolean;
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
              const res = await setRewardRuleActive({
                ruleKey: ruleKey as RuleKey,
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

const pct = (bps: number | null) => (bps === null ? "" : String(bps / 100));
const cedis = (minor: number | null) =>
  minor === null ? "" : (minor / 100).toFixed(2);

/**
 * Publishes the next version of a rule, starting from the latest one. It is
 * created switched off; making it live is a separate step (by another admin
 * when it could pay out more).
 */
export function NewRuleVersionForm({
  latest,
  editable,
}: {
  latest: RewardRuleSummary;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(pct(latest.rateBps));
  const [netCap, setNetCap] = useState(pct(latest.netShareCapBps));
  const [flat, setFlat] = useState(cedis(latest.flatMinor));
  const [minBasis, setMinBasis] = useState(cedis(latest.minBasisMinor));
  const [expiry, setExpiry] = useState(
    latest.expiryDays === null ? "" : String(latest.expiryDays),
  );
  // Caps are whole numbers; older seed versions carried a flag the engine
  // doesn't read (requires_verified_place), which a new version can't hold.
  const [caps, setCaps] = useState(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(latest.caps).filter(([, v]) => typeof v === "number"),
      ),
      null,
      2,
    ),
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

  const toBps = (v: string) =>
    v.trim() === "" ? null : Math.round(Number(v) * 100);
  const toMinor = (v: string) =>
    v.trim() === "" ? null : Math.round(Number(v) * 100);

  const submit = () =>
    start(async () => {
      setMsg(null);
      let parsedCaps: Record<string, number>;
      try {
        parsedCaps = JSON.parse(caps || "{}");
      } catch {
        setMsg(
          'Caps must be valid JSON, e.g. {"per_referrer_month_minor": 50000}.',
        );
        return;
      }
      const res = await publishRewardRuleVersion({
        ruleKey: latest.ruleKey as RuleKey,
        rateBps: toBps(rate),
        netShareCapBps: toBps(netCap),
        flatMinor: toMinor(flat),
        minBasisMinor: toMinor(minBasis) ?? 0,
        caps: parsedCaps,
        expiryDays: expiry.trim() === "" ? null : Math.round(Number(expiry)),
        note: note.trim(),
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setOpen(false);
        router.refresh();
      }
    });

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    suffix: string,
  ) => (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="mt-0.5 flex items-center gap-1">
        <input
          value={value}
          onChange={(e) => set(e.target.value)}
          inputMode="decimal"
          className={`${input} w-24`}
        />
        <span className="text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );

  return (
    <div className="mt-2 space-y-2 rounded border border-border p-3">
      <p className="text-xs text-muted-foreground">
        Starts from v{latest.version}. Leave a field empty for “not used”.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {field("Rate", rate, setRate, "% of ticket revenue")}
        {field(
          latest.ruleKey === "organizer_rebate" ||
            latest.ruleKey === "venue_rebate"
            ? "Share"
            : "Net revenue cap",
          netCap,
          setNetCap,
          "% of net revenue",
        )}
        {field("Flat amount", flat, setFlat, "GH₵")}
        {field("Minimum order", minBasis, setMinBasis, "GH₵")}
        {field("Credit expires after", expiry, setExpiry, "days")}
      </div>
      <label className="block text-xs">
        <span className="text-muted-foreground">
          Caps (JSON, amounts in pesewas)
        </span>
        <textarea
          value={caps}
          onChange={(e) => setCaps(e.target.value)}
          rows={4}
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
