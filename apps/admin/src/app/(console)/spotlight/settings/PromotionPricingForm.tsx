"use client";

import { Button, Card, cn } from "@/components/ui";
import { updatePromotionPricing } from "@/server/actions";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { formatReachRange } from "@abonten/core/content/promotionEstimate";
import type {
  ContentPromotionAudience,
  ContentPromotionEstimate,
  ContentPromotionPricing,
} from "@abonten/types/contentType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type NumKey = {
  [K in keyof ContentPromotionPricing]: ContentPromotionPricing[K] extends number
    ? K
    : never;
}[keyof ContentPromotionPricing];

// Money fields are edited in cedis and stored in pesewas.
const FIELDS: {
  key: Exclude<NumKey, "version">;
  label: string;
  suffix: string;
  cedis?: boolean;
  hint?: string;
}[] = [
  {
    key: "minBudgetMinor",
    label: "Smallest budget",
    suffix: "GH₵",
    cedis: true,
  },
  {
    key: "maxBudgetMinor",
    label: "Largest budget",
    suffix: "GH₵",
    cedis: true,
  },
  { key: "budgetStepMinor", label: "Budget step", suffix: "GH₵", cedis: true },
  {
    key: "cpmMinor",
    label: "Cost per 1,000 sponsored impressions",
    suffix: "GH₵",
    cedis: true,
    hint: "Sets how many impressions a budget buys, and so where delivery stops.",
  },
  {
    key: "avgFrequency",
    label: "Impressions per person reached",
    suffix: "average",
  },
  {
    key: "estimateSpreadBps",
    label: "Estimate range",
    suffix: "± basis points",
  },
  { key: "defaultDurationDays", label: "Default run length", suffix: "days" },
  {
    key: "audienceFloorDailyViewers",
    label: "Planning floor: daily viewers",
    suffix: "people",
    hint: "Used only while measured activity is lower. 0 = measured data only.",
  },
  {
    key: "audienceFloorReach",
    label: "Planning floor: 28-day audience",
    suffix: "people",
  },
  {
    key: "dailyFillBps",
    label: "Share of the daily sponsored cap filled",
    suffix: "basis points",
  },
  {
    key: "maxReachShareBps",
    label: "Most of the audience one promotion can reach",
    suffix: "basis points",
  },
  {
    key: "locationAudienceShareBps",
    label: "Audience left with a location target",
    suffix: "basis points",
  },
  {
    key: "minDeliverableBps",
    label: "Refuse budgets forecast to deliver under",
    suffix: "basis points",
  },
  {
    key: "pacingMultiplier",
    label: "Delivery may run ahead of an even pace by",
    suffix: "×",
  },
];

const list = (v: number[], cedis: boolean) =>
  v.map((n) => (cedis ? n / 100 : n)).join(", ");

export function PromotionPricingForm({
  pricing,
  audience,
  dailyCapPerViewer,
  examples,
  editable,
}: {
  pricing: ContentPromotionPricing;
  audience: ContentPromotionAudience;
  dailyCapPerViewer: number;
  examples: ContentPromotionEstimate[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map((f) => [
        f.key,
        String(f.cedis ? pricing[f.key] / 100 : pricing[f.key]),
      ]),
    ),
  );
  const [suggested, setSuggested] = useState(
    list(pricing.suggestedBudgetsMinor, true),
  );
  const [durations, setDurations] = useState(
    list(pricing.durationOptionsDays, false),
  );
  const [reason, setReason] = useState("");

  const save = () =>
    start(async () => {
      setMsg(null);
      const patch: Record<string, number | number[]> = {};
      for (const f of FIELDS) {
        const n = Number(values[f.key]);
        if (!Number.isFinite(n)) {
          setMsg({ ok: false, text: `${f.label} must be a number.` });
          return;
        }
        patch[f.key] = f.cedis ? Math.round(n * 100) : n;
      }
      const parseList = (text: string, cedis: boolean) =>
        text
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((t) => (cedis ? Math.round(Number(t) * 100) : Number(t)));
      patch.suggestedBudgetsMinor = parseList(suggested, true);
      patch.durationOptionsDays = parseList(durations, false);
      if (
        !window.confirm(
          "New prices and estimates apply to promotions created from now on. Running promotions keep the price they were sold at. Continue?",
        )
      ) {
        return;
      }
      const res = await updatePromotionPricing({
        expectedVersion: pricing.version,
        reason: reason.trim(),
        patch,
      });
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="text-sm font-semibold">
          Promotion pricing and reach estimates (version {pricing.version})
        </p>
        <p className="text-xs text-muted-foreground">
          Advertisers choose a budget; it buys sponsored impressions at the cost
          per 1,000 below. The reach range they see is an estimate from the
          audience figures, never a promise. Changes are audited and apply to
          new promotions only.
        </p>
      </div>

      <div className="grid gap-2 rounded border border-border p-3 text-xs sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground">Measured daily viewers</p>
          <p className="font-semibold">
            {audience.dailyViewers.toLocaleString("en-GB")}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Measured 28-day audience</p>
          <p className="font-semibold">
            {audience.reach28d.toLocaleString("en-GB")}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Measured</p>
          <p className="font-semibold">
            {audience.computedAt
              ? `${new Date(audience.computedAt).toLocaleString()} · ${audience.daysObserved} days`
              : "Not yet"}
          </p>
        </div>
        <p className="text-muted-foreground sm:col-span-3">
          Sponsored posts per viewer per day: {dailyCapPerViewer} (Sponsored
          settings above).
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold">
          Today&apos;s estimates at {pricing.defaultDurationDays} days, everyone
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {examples.map((e) => (
            <li
              key={e.budgetMinor}
              className="rounded border border-border p-2 text-xs"
            >
              <p className="font-semibold">
                {formatMinor(e.budgetMinor, e.currency)}
              </p>
              <p>{e.deliverable ? formatReachRange(e) : "Would be refused"}</p>
              <p className="text-muted-foreground">
                {e.impressionGoal.toLocaleString("en-GB")} impressions bought ·{" "}
                {e.basis}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="text-sm">
            <label htmlFor={`pricing-${f.key}`} className="block font-medium">
              {f.label}
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={`pricing-${f.key}`}
                inputMode="decimal"
                value={values[f.key]}
                disabled={!editable}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className={cn(input, "w-28")}
              />
              <span className="text-xs text-muted-foreground">{f.suffix}</span>
            </div>
            {f.hint ? (
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            ) : null}
          </div>
        ))}
        <div className="text-sm">
          <label htmlFor="pricing-suggested" className="block font-medium">
            Suggested budgets
          </label>
          <input
            id="pricing-suggested"
            value={suggested}
            disabled={!editable}
            onChange={(e) => setSuggested(e.target.value)}
            className={cn(input, "mt-1")}
          />
          <p className="text-xs text-muted-foreground">GH₵, comma separated</p>
        </div>
        <div className="text-sm">
          <label htmlFor="pricing-durations" className="block font-medium">
            Run length options
          </label>
          <input
            id="pricing-durations"
            value={durations}
            disabled={!editable}
            onChange={(e) => setDurations(e.target.value)}
            className={cn(input, "mt-1")}
          />
          <p className="text-xs text-muted-foreground">days, comma separated</p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="pricing-reason" className="text-sm font-semibold">
          Reason for this change
        </label>
        <input
          id="pricing-reason"
          value={reason}
          disabled={!editable}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Recorded in the audit log"
          className={input}
        />
        <div className="flex items-center gap-3">
          <Button
            disabled={!editable || pending || reason.trim().length < 5}
            onClick={save}
          >
            {pending ? "Saving…" : "Save pricing"}
          </Button>
          {msg ? (
            <span
              className={cn(
                "text-sm",
                msg.ok ? "text-success" : "text-destructive",
              )}
            >
              {msg.text}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
