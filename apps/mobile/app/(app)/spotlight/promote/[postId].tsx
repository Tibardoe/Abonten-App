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
  useEffect(() => {
    if (!opts) return;
    setBudgetText((b) =>
      b === ""
        ? String((opts.suggestedBudgetsMinor[1] ?? opts.minBudgetMinor) / 100)
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

  const budgetMinor = Math.round(Number(budgetText) * 100);
  const budgetError =
    opts && budgetText !== "" ? budgetProblem(opts, budgetMinor) : null;
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
    if (budgetProblem(opts, r.budgetMinor)) return null;
    return { postId, ...r, durationDays: r.durationDays };
  }, [requestKey, postId, opts]);
  const estimate = usePromotionEstimate(request);
  const est = estimate.data;
  const stale = estimate.isFetching || requestKey !== liveKey;

  const header = (
    <AppHeader
      variant="detail"
      title="Promote"
      backFallback="/(app)/spotlight/manage"
    />
  );

  if (!program.spotlightPromotions) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <EmptyState
          icon="megaphone-outline"
          title="Promotions aren't available yet"
          description="Check back soon."
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
          subject="this Spotlight"
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
      "this Spotlight's location")
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
        toast.error("Couldn't start", {
          description: res.message ?? "Please try again.",
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
      toast.error("Couldn't start", { description: "Check your connection." });
    } finally {
      setStarting(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      <KeyboardAwareScrollView contentContainerClassName="gap-5 p-4 pb-16">
        <AppText variant="muted">{PROMOTION_INTRO}</AppText>

        {reserved ? (
          <View className="gap-3">
            <View className="gap-1 rounded-xl border border-border bg-card p-4">
              <AppText variant="bodyStrong">{reserved.summary}</AppText>
              <AppText variant="meta">
                {CAMPAIGN_OBJECTIVE_LABEL[objective]} · Estimated reach{" "}
                {reserved.reach}
              </AppText>
            </View>
            <AppText variant="caption" tone="muted">
              {PROMOTION_CASH_NOTE}
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
              : "Promotions aren't available right now."}
          </AppText>
        ) : (
          <>
            <View className="gap-2">
              <AppText variant="label">Goal</AppText>
              <View className="flex-row flex-wrap gap-2">
                {objectives.map((o) => (
                  <Chip
                    key={o}
                    label={CAMPAIGN_OBJECTIVE_LABEL[o]}
                    selected={objective === o}
                    onPress={() => setObjective(o)}
                  />
                ))}
              </View>
            </View>

            <View className="gap-2">
              <AppText variant="label">Who should see it</AppText>
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  label="Everyone on Spotlight"
                  selected={area === "everywhere"}
                  onPress={() => setArea("everywhere")}
                />
                {locationLabel ? (
                  <Chip
                    label="People nearby"
                    selected={area === "near_post"}
                    onPress={() => setArea("near_post")}
                  />
                ) : null}
              </View>
              {area === "near_post" && locationLabel ? (
                <>
                  <AppText variant="meta">Near {locationLabel}</AppText>
                  <View className="flex-row flex-wrap gap-2">
                    {opts.radiusOptionsKm.map((km) => (
                      <Chip
                        key={km}
                        label={`Within ${km} km`}
                        selected={radiusKm === km}
                        onPress={() => setRadiusKm(km)}
                      />
                    ))}
                  </View>
                </>
              ) : !locationLabel ? (
                <AppText variant="caption" tone="muted">
                  Link an event or place to show it to people nearby.
                </AppText>
              ) : null}
            </View>

            <View className="gap-2">
              <AppText variant="label">Budget</AppText>
              <View className="flex-row flex-wrap gap-2">
                {opts.suggestedBudgetsMinor.map((b) => (
                  <Chip
                    key={b}
                    label={formatMinor(b, opts.currency)}
                    selected={budgetMinor === b}
                    onPress={() => setBudgetText(String(b / 100))}
                  />
                ))}
              </View>
              <View className="flex-row items-center gap-2">
                <AppText variant="bodyStrong">GH₵</AppText>
                <Input
                  className="flex-1"
                  value={budgetText}
                  onChangeText={setBudgetText}
                  keyboardType="decimal-pad"
                  invalid={!!budgetError}
                  accessibilityLabel="Budget in cedis"
                />
              </View>
              <AppText variant="caption" tone={budgetError ? "error" : "muted"}>
                {budgetError ??
                  `${formatMinor(opts.minBudgetMinor, opts.currency)} to ${formatMinor(opts.maxBudgetMinor, opts.currency)}.`}
              </AppText>
            </View>

            <View className="gap-2">
              <AppText variant="label">Run for up to</AppText>
              <View className="flex-row flex-wrap gap-2">
                {opts.durationOptionsDays.map((d) => (
                  <Chip
                    key={d}
                    label={`${d} days`}
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
              <AppText variant="overline">Estimated reach</AppText>
              {!request ? (
                <AppText variant="muted">
                  Choose a budget to see an estimate.
                </AppText>
              ) : estimate.isError ? (
                <AppText tone="error">
                  {estimate.error instanceof Error
                    ? estimate.error.message
                    : "Couldn't estimate reach."}
                </AppText>
              ) : !est ? (
                <ActivityIndicator />
              ) : (
                <View style={{ opacity: stale ? 0.6 : 1 }}>
                  <AppText variant="sectionTitle">
                    {est.deliverable
                      ? formatReachRange(est)
                      : "Not enough audience"}
                  </AppText>
                  <AppText variant="meta">
                    {est.deliverable
                      ? `About ${est.estimatedImpressions.toLocaleString("en-GB")} sponsored impressions. ${PROMOTION_ESTIMATE_BASIS_LABEL[est.basis]}`
                      : est.basis === "no_data"
                        ? PROMOTION_ESTIMATE_BASIS_LABEL.no_data
                        : "This audience is too small for this budget right now. Lower the budget, run it longer or show it to more people."}
                  </AppText>
                </View>
              )}
            </View>

            <View className="gap-2">
              <AppText variant="caption" tone="muted">
                {PROMOTION_ESTIMATE_NOTE}
              </AppText>
              <AppText variant="caption" tone="muted">
                {PROMOTION_BILLING_NOTE}
              </AppText>
              <AppText variant="caption" tone="muted">
                {PROMOTION_REVIEW_NOTE} {PROMOTION_CASH_NOTE}
              </AppText>
            </View>

            <Button
              title={`Continue with ${formatMinor(Number.isFinite(budgetMinor) ? budgetMinor : 0, opts.currency)}`}
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
