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
  PROMOTION_BILLING_NOTE_KEY,
  PROMOTION_CASH_NOTE_KEY,
  PROMOTION_ESTIMATE_NOTE_KEY,
  PROMOTION_INTRO_KEY,
  PROMOTION_REVIEW_NOTE_KEY,
  campaignObjectiveLabel,
  promotionEstimateBasisLabel,
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
import { useFormatter, useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
  const t = useTranslations("spotlight");
  const tc = useTranslations("core");
  const format = useFormatter();

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
    opts && budgetCedis !== "" ? budgetProblem(tc, opts, budgetMinor) : null;
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
      if (!data) throw new Error(messageOf(res, t("couldnTEstimateReach")));
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
      toast.error(t("chooseAStartDate"));
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
      toast.error(messageOf(res, t("couldnTStartThisPromotion")));
      return;
    }
    router.push(`/checkout/${data.checkout.id}?type=spotlight-promotion`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogTitle>{t("promoteThisSpotlight")}</DialogTitle>
        <DialogDescription>{tc(PROMOTION_INTRO_KEY)}</DialogDescription>

        {options.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !opts ? (
          <p className="text-sm text-muted-foreground">
            {options.error instanceof Error
              ? options.error.message
              : t("promotionsArenTAvailableRightNow")}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor={`${ids}-goal`}>{t("goal")}</label>
              <Select
                id={`${ids}-goal`}
                value={objective}
                onChange={(e) =>
                  setObjective(e.target.value as ContentCampaignObjective)
                }
              >
                {objectives.map((o) => (
                  <option key={o} value={o}>
                    {campaignObjectiveLabel(tc, o)}
                  </option>
                ))}
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("whoShouldSeeIt")}
              </legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${ids}-area`}
                  checked={area === "everywhere"}
                  onChange={() => setArea("everywhere")}
                />
                {t("everyoneOnSpotlight")}
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
                  ? t("peopleNear", { locationLabel: locationLabel })
                  : t("peopleNearbyLinkAnEventOr")}
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
                      {t("withinKm", { km: km })}
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
                {t("budget")}
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
                    {formatMinor(b, opts.currency, locale)}
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
                  t("to", {
                    formatMinor: formatMinor(
                      opts.minBudgetMinor,
                      opts.currency,
                      locale,
                    ),
                    formatMinor2: formatMinor(
                      opts.maxBudgetMinor,
                      opts.currency,
                      locale,
                    ),
                  })}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("runForUpTo")}</legend>
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
                    {t("days", { d: d })}
                  </button>
                ))}
              </div>
            </fieldset>

            <section
              aria-live="polite"
              className="space-y-1 rounded-lg border bg-muted/40 p-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("estimatedReach")}
              </p>
              {!canEstimate ? (
                <p className="text-sm text-muted-foreground">
                  {t("chooseABudgetToSeeAn")}
                </p>
              ) : estimate.isError ? (
                <p className="text-sm text-destructive">
                  {estimate.error instanceof Error
                    ? estimate.error.message
                    : t("couldnTEstimateReach")}
                </p>
              ) : !est ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <div className={cn(stale && "opacity-60")}>
                  <p className="text-xl font-bold">
                    {est.deliverable
                      ? formatReachRange(tc, est)
                      : t("notEnoughAudience")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {est.deliverable
                      ? t("aboutSponsoredImpressions", {
                          impressions: format.number(est.estimatedImpressions),
                          item: promotionEstimateBasisLabel(tc, est.basis),
                        })
                      : est.basis === "no_data"
                        ? promotionEstimateBasisLabel(tc, "no_data")
                        : t("thisAudienceIsTooSmallFor")}
                  </p>
                </div>
              )}
            </section>

            <label className="block space-y-1 text-sm font-medium">
              <span>{t("startAfterApproval")}</span>
              <input
                type="datetime-local"
                value={startsAt}
                min={localInputValue(new Date())}
                onChange={(e) => setStartsAt(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <div className="space-y-2 text-xs text-muted-foreground">
              <p>{tc(PROMOTION_ESTIMATE_NOTE_KEY)}</p>
              <p>{tc(PROMOTION_BILLING_NOTE_KEY)}</p>
              <p>{tc(PROMOTION_REVIEW_NOTE_KEY)}</p>
              <p>{tc(PROMOTION_CASH_NOTE_KEY)}</p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!est?.deliverable || stale || submitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting
                  ? t("starting")
                  : t("pay", {
                      formatMinor: formatMinor(
                        Number.isFinite(budgetMinor) ? budgetMinor : 0,
                        opts.currency,
                        locale,
                      ),
                    })}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
