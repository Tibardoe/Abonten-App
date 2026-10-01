import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { PromotionPaymentSection } from "@/components/organizer/PromotionPaymentSection";
import {
  useContentPost,
  useInvalidateContent,
  usePromotionEstimate,
  usePromotionOptions,
} from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { useDebouncedValue } from "@/features/search/useEventSearch";
import { api } from "@/lib/api";
import { useQueryView } from "@/lib/useQueryView";
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
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Input,
  KeyboardAwareScrollView,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

type Reserved = {
  campaignId: string;
  checkoutId: string;
  amount: number;
  currency: string;
  summary: string;
  reach: string;
};

// Promote a live Spotlight: choose a goal, who should see it, a budget and
// the longest it may run. The server prices it and returns an estimated
// reach range (never a promise); nothing runs until payment is confirmed
// and the promotion passes review.
export default function PromoteSpotlightScreen() {
  const t = useTranslations("spotlight");
  const tc = useTranslations("core");

  const { postId } = useLocalSearchParams<{ postId: string }>();
  const toast = useToast();
  const invalidate = useInvalidateContent();
  const { program } = useContentProgram();
  const post = useContentPost(postId);
  const options = usePromotionOptions(program.spotlightPromotions);
  const postView = useQueryView(post);
  const optionsView = useQueryView(options);
  const [objective, setObjective] = useState<ContentCampaignObjective>("views");
  const [area, setArea] = useState<"everywhere" | "near_post">("everywhere");
  const [radiusKm, setRadiusKm] = useState(25);
  const [budgetText, setBudgetText] = useState("");
  const [durationDays, setDurationDays] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [reserved, setReserved] = useState<Reserved | null>(null);

  const opts = options.data;
  // Minor units per major unit of the campaign's currency (100 for GH₵,
  // 1 for a zero-decimal currency like CFA francs).
  const factor = opts ? currencyMinorFactor(opts.currency) : 100;
  useEffect(() => {
    if (!opts) return;
    setBudgetText((b) =>
      b === ""
        ? String(
            (opts.suggestedBudgetsMinor[1] ?? opts.minBudgetMinor) /
              currencyMinorFactor(opts.currency),
          )
        : b,
    );
    setDurationDays((d) => d ?? opts.defaultDurationDays);
  }, [opts]);

  const doc =
    post.data &&
    post.data.status === 200 &&
    post.data.data &&
    "post" in post.data.data
      ? post.data.data.post
      : null;

  const budgetMinor = Math.round(Number(budgetText) * factor);
  const budgetError =
    opts && budgetText !== "" ? budgetProblem(tc, opts, budgetMinor) : null;
  const targeting: ContentPromotionTargetingInput =
    area === "near_post" ? { area, radiusKm } : { area: "everywhere" };
  // Debounce a string: a new object every render would never settle.
  const liveKey = JSON.stringify({ budgetMinor, durationDays, targeting });
  const requestKey = useDebouncedValue(liveKey, 400);
  const request = useMemo(() => {
    const r = JSON.parse(requestKey) as {
      budgetMinor: number;
      durationDays: number | null;
      targeting: ContentPromotionTargetingInput;
    };
    if (!postId || !opts || r.durationDays === null) return null;
    if (budgetProblem(tc, opts, r.budgetMinor)) return null;
    return { postId, ...r, durationDays: r.durationDays };
  }, [requestKey, postId, opts, tc]);
  const estimate = usePromotionEstimate(request);
  const est = estimate.data;
  const stale = estimate.isFetching || requestKey !== liveKey;

  const header = (
    <AppHeader
      variant="detail"
      title={t("promote")}
      backFallback="/(app)/spotlight/manage"
    />
  );

  if (!program.spotlightPromotions) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <EmptyState
          icon="megaphone-outline"
          title={t("promotionsArenTAvailableYet")}
          description={t("checkBackSoon")}
        />
      </View>
    );
  }
  // Loading, offline and failed are told apart: the form never opens on a
  // post or price list the phone does not have.
  const blocked =
    postView.kind !== "content" && postView.kind !== "empty"
      ? postView
      : optionsView.kind !== "content" && optionsView.kind !== "empty"
        ? optionsView
        : null;
  if (blocked) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={blocked}
          subject={t("thisSpotlight")}
          onRetry={() => {
            post.refetch();
            options.refetch();
          }}
          loading={<Spinner />}
        />
      </View>
    );
  }

  const objectives = CAMPAIGN_OBJECTIVES.filter((o) => {
    if (o === "event_views" || o === "ticket_sales") return !!doc?.event;
    if (o === "place_views" || o === "reservations")
      return !!doc?.place || doc?.publisher.kind === "place";
    return true;
  });
  const locationLabel = doc?.location
    ? (doc.place?.name ??
      doc.event?.title ??
      (doc.publisher.kind === "place" ? doc.publisher.name : null) ??
      t("thisSpotlightSLocation"))
    : null;

  const start = async () => {
    if (!est?.deliverable || !postId || !durationDays || starting || stale)
      return;
    setStarting(true);
    try {
      const res = await api.content.createCampaign({
        postId,
        budgetMinor,
        durationDays,
        objective,
        // Starts as soon as it is approved.
        startsAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        targeting,
      });
      if (res.status !== 200 || !res.data) {
        toast.error(t("couldnTStart"), {
          description: res.message ?? t("pleaseTryAgain"),
        });
        return;
      }
      setReserved({
        campaignId: res.data.campaign.id,
        checkoutId: res.data.checkout.id,
        amount: res.data.checkout.totalPrice,
        currency: res.data.checkout.currency,
        summary: res.data.checkout.summaryLabel,
        reach: formatReachRange({
          reachLow: res.data.checkout.estimatedReachLow,
          reachHigh: res.data.checkout.estimatedReachHigh,
        }),
      });
    } catch {
      toast.error(t("couldnTStart"), { description: t("checkYourConnection") });
    } finally {
      setStarting(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      <KeyboardAwareScrollView contentContainerClassName="gap-5 p-4 pb-16">
        <AppText variant="muted">{tc(PROMOTION_INTRO_KEY)}</AppText>

        {reserved ? (
          <View className="gap-3">
            <View className="gap-1 rounded-xl border border-border bg-card p-4">
              <AppText variant="bodyStrong">{reserved.summary}</AppText>
              <AppText variant="meta">
                {t("estimatedReach2", {
                  item: campaignObjectiveLabel(tc, objective),
                  reach: reserved.reach,
                })}
              </AppText>
            </View>
            <AppText variant="caption" tone="muted">
              {tc(PROMOTION_CASH_NOTE_KEY)}
            </AppText>
            <PromotionPaymentSection
              kind="spotlight"
              checkoutId={reserved.checkoutId}
              entityId={reserved.campaignId}
              currency={reserved.currency}
              amount={reserved.amount}
              onFeatured={invalidate}
            />
          </View>
        ) : !opts ? (
          <AppText variant="muted">
            {options.error instanceof Error
              ? options.error.message
              : t("promotionsArenTAvailableRightNow")}
          </AppText>
        ) : (
          <>
            <View className="gap-2">
              <AppText variant="label">{t("goal")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {objectives.map((o) => (
                  <Chip
                    key={o}
                    label={campaignObjectiveLabel(tc, o)}
                    selected={objective === o}
                    onPress={() => setObjective(o)}
                  />
                ))}
              </View>
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("whoShouldSeeIt")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  label={t("everyoneOnSpotlight")}
                  selected={area === "everywhere"}
                  onPress={() => setArea("everywhere")}
                />
                {locationLabel ? (
                  <Chip
                    label={t("peopleNearby")}
                    selected={area === "near_post"}
                    onPress={() => setArea("near_post")}
                  />
                ) : null}
              </View>
              {area === "near_post" && locationLabel ? (
                <>
                  <AppText variant="meta">
                    {t("near", { locationLabel: locationLabel })}
                  </AppText>
                  <View className="flex-row flex-wrap gap-2">
                    {opts.radiusOptionsKm.map((km) => (
                      <Chip
                        key={km}
                        label={t("withinKm", { km: km })}
                        selected={radiusKm === km}
                        onPress={() => setRadiusKm(km)}
                      />
                    ))}
                  </View>
                </>
              ) : !locationLabel ? (
                <AppText variant="caption" tone="muted">
                  {t("linkAnEventOrPlaceTo")}
                </AppText>
              ) : null}
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("budget")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {opts.suggestedBudgetsMinor.map((b) => (
                  <Chip
                    key={b}
                    label={formatMinor(b, opts.currency)}
                    selected={budgetMinor === b}
                    onPress={() => setBudgetText(String(b / factor))}
                  />
                ))}
              </View>
              <View className="flex-row items-center gap-2">
                <AppText variant="bodyStrong">
                  {currencySymbol(opts.currency)}
                </AppText>
                <Input
                  className="flex-1"
                  value={budgetText}
                  onChangeText={setBudgetText}
                  keyboardType="decimal-pad"
                  invalid={!!budgetError}
                  accessibilityLabel={t("budgetInCedis")}
                />
              </View>
              <AppText variant="caption" tone={budgetError ? "error" : "muted"}>
                {budgetError ??
                  t("to", {
                    formatMinor: formatMinor(
                      opts.minBudgetMinor,
                      opts.currency,
                    ),
                    formatMinor2: formatMinor(
                      opts.maxBudgetMinor,
                      opts.currency,
                    ),
                  })}
              </AppText>
            </View>

            <View className="gap-2">
              <AppText variant="label">{t("runForUpTo")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {opts.durationOptionsDays.map((d) => (
                  <Chip
                    key={d}
                    label={t("days", { d: d })}
                    selected={durationDays === d}
                    onPress={() => setDurationDays(d)}
                  />
                ))}
              </View>
            </View>

            <View
              className="gap-1 rounded-xl border border-border bg-card p-4"
              accessibilityLiveRegion="polite"
            >
              <AppText variant="overline">{t("estimatedReach")}</AppText>
              {!request ? (
                <AppText variant="muted">{t("chooseABudgetToSeeAn")}</AppText>
              ) : estimate.isError ? (
                <AppText tone="error">
                  {estimate.error instanceof Error
                    ? estimate.error.message
                    : t("couldnTEstimateReach")}
                </AppText>
              ) : !est ? (
                <ActivityIndicator />
              ) : (
                <View style={{ opacity: stale ? 0.6 : 1 }}>
                  <AppText variant="sectionTitle">
                    {est.deliverable
                      ? formatReachRange(est)
                      : t("notEnoughAudience")}
                  </AppText>
                  <AppText variant="meta">
                    {est.deliverable
                      ? t("aboutSponsoredImpressions2", {
                          toLocaleString:
                            est.estimatedImpressions.toLocaleString("en-GB"),
                          item: promotionEstimateBasisLabel(tc, est.basis),
                        })
                      : est.basis === "no_data"
                        ? promotionEstimateBasisLabel(tc, "no_data")
                        : t("thisAudienceIsTooSmallFor")}
                  </AppText>
                </View>
              )}
            </View>

            <View className="gap-2">
              <AppText variant="caption" tone="muted">
                {tc(PROMOTION_ESTIMATE_NOTE_KEY)}
              </AppText>
              <AppText variant="caption" tone="muted">
                {tc(PROMOTION_BILLING_NOTE_KEY)}
              </AppText>
              <AppText variant="caption" tone="muted">
                {tc(PROMOTION_REVIEW_NOTE_KEY)} {tc(PROMOTION_CASH_NOTE_KEY)}
              </AppText>
            </View>

            <Button
              title={t("continueWith", {
                formatMinor: formatMinor(
                  Number.isFinite(budgetMinor) ? budgetMinor : 0,
                  opts.currency,
                ),
              })}
              loading={starting}
              disabled={!est?.deliverable || stale}
              onPress={start}
            />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
