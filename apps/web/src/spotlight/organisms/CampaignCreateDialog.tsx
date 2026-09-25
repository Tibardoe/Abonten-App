"use client";

import { createContentCampaign } from "@/actions/content/createContentCampaign";
import { estimateContentPromotion } from "@/actions/content/estimateContentPromotion";
import { getPromotionOptions } from "@/actions/content/getPromotionOptions";
import { cn } from "@/components/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_OBJECTIVE_LABEL,
  PROMOTION_BILLING_NOTE,
  PROMOTION_CASH_NOTE,
  PROMOTION_ESTIMATE_BASIS_LABEL,
  PROMOTION_ESTIMATE_NOTE,
  PROMOTION_INTRO,
  PROMOTION_REVIEW_NOTE,
} from "@abonten/core/content/copy";
import {
  budgetProblem,
  formatReachRange,
} from "@abonten/core/content/promotionEstimate";
import { currencyMinorFactor } from "@abonten/core/money/currencies";
import { currencySymbol } from "@abonten/core/money/formatMoney";
import type {
  ContentCampaignObjective,
  ContentPromotionTargetingInput,
} from "@abonten/types/contentType";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { dataOf, messageOf } from "../lib/result";

function localInputValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Promote a live Spotlight: choose a goal, an audience, a budget and the
 * longest it may run. The server prices it and returns an estimated reach
 * range (never a promise); paying opens the normal checkout page. Nothing
 * runs until the payment is confirmed and the promotion passes review.
 */
export default function CampaignCreateDialog({
  postId,
  hasEvent,
  hasPlace,
  locationLabel,
  onClose,
}: {
  postId: string;
  hasEvent: boolean;
  hasPlace: boolean;
  /** e.g. the event venue or place name; null when the post has no location. */
  locationLabel: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const ids = useId();
  const options = useQuery({
    queryKey: ["content", "promotion-options"],
    queryFn: async () => {
      const res = await getPromotionOptions();
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
  });
  const objectives = CAMPAIGN_OBJECTIVES.filter((o) => {
    if (o === "event_views" || o === "ticket_sales") return hasEvent;
    if (o === "place_views" || o === "reservations") return hasPlace;
    return true;
  });
  const [objective, setObjective] = useState<ContentCampaignObjective>("views");
  const [area, setArea] = useState<"everywhere" | "near_post">("everywhere");
  const [radiusKm, setRadiusKm] = useState(25);
  const [budgetCedis, setBudgetCedis] = useState<string>("");
  const [durationDays, setDurationDays] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState(() =>
    localInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [submitting, setSubmitting] = useState(false);

  const opts = options.data;
  // Minor units per major unit of the campaign's currency (100 for GH₵,
  // 1 for a zero-decimal currency like CFA francs).
  const factor = opts ? currencyMinorFactor(opts.currency) : 100;
  useEffect(() => {
    if (!opts) return;
    setBudgetCedis((b) =>
      b === ""
        ? String(
            (opts.suggestedBudgetsMinor[1] ?? opts.minBudgetMinor) /
              currencyMinorFactor(opts.currency),
          )
        : b,
    );
    setDurationDays((d) => d ?? opts.defaultDurationDays);
  }, [opts]);

  const budgetMinor = Math.round(Number(budgetCedis) * factor);
  const budgetError =
    opts && budgetCedis !== "" ? budgetProblem(opts, budgetMinor) : null;
  const targeting: ContentPromotionTargetingInput =
    area === "near_post" ? { area, radiusKm } : { area: "everywhere" };
  // Debounce a string, not an object: a fresh object every render would
  // restart the timer forever.
  const liveKey = JSON.stringify({ budgetMinor, durationDays, targeting });
  const requestKey = useDebounced(liveKey, 350);
  const request = useMemo(
    () =>
      JSON.parse(requestKey) as {
        budgetMinor: number;
        durationDays: number | null;
        targeting: ContentPromotionTargetingInput;
      },
    [requestKey],
  );
  const canEstimate =
    !!opts &&
    request.durationDays !== null &&
    Number.isInteger(request.budgetMinor) &&
    request.budgetMinor > 0 &&
    !budgetError;

  const estimate = useQuery({
    queryKey: ["content", "promotion-estimate", postId, requestKey],
    enabled: canEstimate,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await estimateContentPromotion({
        postId,
        budgetMinor: request.budgetMinor,
        durationDays: request.durationDays,
        targeting: request.targeting,
      });
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res, "Couldn't estimate reach."));
      return data;
    },
    retry: false,
  });
  const est = estimate.data;
  const stale = estimate.isFetching || requestKey !== liveKey;

  const submit = async () => {
    if (!est || !durationDays || submitting || stale) return;
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) {
      toast.error("Choose a start date.");
      return;
    }
    setSubmitting(true);
    const res = await createContentCampaign({
      postId,
      budgetMinor,
      durationDays,
      objective,
      startsAt: start.toISOString(),
      targeting,
    });
    const data = dataOf(res);
    if (!data) {
      setSubmitting(false);
      toast.error(messageOf(res, "Couldn't start this promotion."));
      return;
    }
    router.push(`/checkout/${data.checkout.id}?type=spotlight-promotion`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogTitle>Promote this Spotlight</DialogTitle>
        <DialogDescription>{PROMOTION_INTRO}</DialogDescription>

        {options.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !opts ? (
          <p className="text-sm text-muted-foreground">
            {options.error instanceof Error
              ? options.error.message
              : "Promotions aren't available right now."}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor={`${ids}-goal`}>Goal</label>
              <Select
                id={`${ids}-goal`}
                value={objective}
                onChange={(e) =>
                  setObjective(e.target.value as ContentCampaignObjective)
                }
              >
                {objectives.map((o) => (
                  <option key={o} value={o}>
                    {CAMPAIGN_OBJECTIVE_LABEL[o]}
                  </option>
                ))}
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Who should see it</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${ids}-area`}
                  checked={area === "everywhere"}
                  onChange={() => setArea("everywhere")}
                />
                Everyone on Spotlight
              </label>
              <label
                className={cn(
                  "flex items-center gap-2 text-sm",
                  locationLabel ? "cursor-pointer" : "opacity-50",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-area`}
                  disabled={!locationLabel}
                  checked={area === "near_post"}
                  onChange={() => setArea("near_post")}
                />
                {locationLabel
                  ? `People near ${locationLabel}`
                  : "People nearby (link an event or place first)"}
              </label>
              {area === "near_post" ? (
                <div className="flex flex-wrap gap-2 pl-6">
                  {opts.radiusOptionsKm.map((km) => (
                    <button
                      key={km}
                      type="button"
                      aria-pressed={radiusKm === km}
                      onClick={() => setRadiusKm(km)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        radiusKm === km
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent",
                      )}
                    >
                      Within {km} km
                    </button>
                  ))}
                </div>
              ) : null}
            </fieldset>

            <div className="space-y-2">
              <label
                htmlFor={`${ids}-budget`}
                className="block text-sm font-medium"
              >
                Budget
              </label>
              <div className="flex flex-wrap gap-2">
                {opts.suggestedBudgetsMinor.map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={budgetMinor === b}
                    onClick={() => setBudgetCedis(String(b / factor))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm font-semibold",
                      budgetMinor === b
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {formatMinor(b, opts.currency)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {currencySymbol(opts.currency)}
                </span>
                <input
                  id={`${ids}-budget`}
                  type="number"
                  inputMode="decimal"
                  min={opts.minBudgetMinor / factor}
                  max={opts.maxBudgetMinor / factor}
                  step={opts.budgetStepMinor / factor}
                  value={budgetCedis}
                  onChange={(e) => setBudgetCedis(e.target.value)}
                  aria-invalid={!!budgetError}
                  aria-describedby={`${ids}-budget-help`}
                  className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <p
                id={`${ids}-budget-help`}
                className={cn(
                  "text-xs",
                  budgetError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {budgetError ??
                  `${formatMinor(opts.minBudgetMinor, opts.currency)} to ${formatMinor(opts.maxBudgetMinor, opts.currency)}.`}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Run for up to</legend>
              <div className="flex flex-wrap gap-2">
                {opts.durationOptionsDays.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={durationDays === d}
                    onClick={() => setDurationDays(d)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm font-semibold",
                      durationDays === d
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </fieldset>

            <section
              aria-live="polite"
              className="space-y-1 rounded-lg border bg-muted/40 p-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Estimated reach
              </p>
              {!canEstimate ? (
                <p className="text-sm text-muted-foreground">
                  Choose a budget to see an estimate.
                </p>
              ) : estimate.isError ? (
                <p className="text-sm text-destructive">
                  {estimate.error instanceof Error
                    ? estimate.error.message
                    : "Couldn't estimate reach."}
                </p>
              ) : !est ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <div className={cn(stale && "opacity-60")}>
                  <p className="text-xl font-bold">
                    {est.deliverable
                      ? formatReachRange(est)
                      : "Not enough audience"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {est.deliverable
                      ? `About ${est.estimatedImpressions.toLocaleString("en-GB")} sponsored impressions. ${PROMOTION_ESTIMATE_BASIS_LABEL[est.basis]}`
                      : est.basis === "no_data"
                        ? PROMOTION_ESTIMATE_BASIS_LABEL.no_data
                        : "This audience is too small for this budget right now. Lower the budget, run it longer or show it to more people."}
                  </p>
                </div>
              )}
            </section>

            <label className="block space-y-1 text-sm font-medium">
              <span>Start (after approval)</span>
              <input
                type="datetime-local"
                value={startsAt}
                min={localInputValue(new Date())}
                onChange={(e) => setStartsAt(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <div className="space-y-2 text-xs text-muted-foreground">
              <p>{PROMOTION_ESTIMATE_NOTE}</p>
              <p>{PROMOTION_BILLING_NOTE}</p>
              <p>{PROMOTION_REVIEW_NOTE}</p>
              <p>{PROMOTION_CASH_NOTE}</p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!est?.deliverable || stale || submitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting
                  ? "Starting…"
                  : `Pay ${formatMinor(Number.isFinite(budgetMinor) ? budgetMinor : 0, opts.currency)}`}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
