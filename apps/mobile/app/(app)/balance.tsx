import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  PlanProgressBlock,
  PlanStatusPill,
} from "@/features/ticketPlans/PlanBits";
import { useBalance } from "@/features/ticketPlans/useTicketPlans";
import { useQueryView } from "@/lib/useQueryView";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { planMomentText } from "@abonten/core/ticketPlans/display";
import { isPlanOpen } from "@abonten/core/ticketPlans/rules";
import type { BalanceOverview } from "@abonten/types/ticketPlanType";
import { AppText, Refresher, Spinner } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";

// The Balance screen. Two kinds of value, side by side and never added
// together: money put towards tickets on Pay small small plans (the buyer's
// cash, refundable, on its way to a ticket) and Abonten Credit from rewards
// (spend-only, can expire, never cashed out). There is no top-up balance:
// holding people's money for later use is a regulated service.

export default function BalanceScreen() {
  const t = useTranslations("ticketPlans");
  const { locale } = useLocale();
  const router = useRouter();
  const query = useBalance();
  const view = useQueryView(query);
  const data: BalanceOverview | null =
    query.data?.status === 200 ? (query.data.data ?? null) : null;

  useFocusEffect(
    useCallback(() => {
      void query.refetch();
    }, [query.refetch]),
  );

  const header = (
    <AppHeader variant="title" title={t("balance")} backFallback="/(app)" />
  );

  if (!data) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={view}
          subject={t("yourBalance")}
          onRetry={() => void query.refetch()}
          loading={
            <View className="flex-1 items-center justify-center">
              <Spinner />
            </View>
          }
        />
      </View>
    );
  }

  const open = data.plans.filter((p) => isPlanOpen(p.status));
  const past = data.plans.filter((p) => !isPlanOpen(p.status));

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-8"
        refreshControl={
          <Refresher
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
      >
        <View className="gap-1.5 rounded-2xl border border-border bg-card p-4">
          <AppText variant="overline">{t("savedTowardsTickets")}</AppText>
          {data.savedTowardsTickets.length === 0 ? (
            <AppText variant="cardTitle">{t("nothingSavedYet")}</AppText>
          ) : (
            data.savedTowardsTickets.map((s) => (
              <AppText key={s.currency} variant="pageTitle">
                {formatMoney(
                  { amountMinor: s.amountMinor, currency: s.currency },
                  { locale },
                )}
              </AppText>
            ))
          )}
          <AppText variant="meta">{t("savedTowardsTicketsBody")}</AppText>
        </View>

        {data.credit ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/rewards")}
            className="gap-1.5 rounded-2xl border border-border bg-card p-4 active:opacity-80"
          >
            <AppText variant="overline">{t("abontenCredit")}</AppText>
            <AppText variant="pageTitle">
              {formatMoney(
                {
                  amountMinor: data.credit.availableMinor,
                  currency: data.credit.currency,
                },
                { locale },
              )}
            </AppText>
            <AppText variant="meta">{t("abontenCreditBody")}</AppText>
            <AppText variant="small" tone="brand" className="font-semibold">
              {t("seeRewards")}
            </AppText>
          </Pressable>
        ) : null}

        <View className="gap-2">
          <AppText variant="sectionHeading">{t("yourPlans")}</AppText>
          {open.length === 0 ? (
            <View className="gap-1 rounded-2xl border border-dashed border-border p-4">
              <AppText variant="bodyStrong">{t("noOpenPlans")}</AppText>
              <AppText variant="meta">
                {data.plansEnabled
                  ? t("noOpenPlansHowTo")
                  : t("noOpenPlansUnavailable")}
              </AppText>
            </View>
          ) : (
            open.map((plan) => (
              <Pressable
                key={plan.id}
                accessibilityRole="button"
                onPress={() => router.push(`/(app)/ticket-plans/${plan.id}`)}
                className="gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {plan.eventTitle}
                    </AppText>
                    <AppText variant="caption">
                      {t("finishByShort", {
                        deadline: planMomentText(
                          plan.deadlineAt,
                          plan.timezone,
                          locale,
                        ),
                      })}
                    </AppText>
                  </View>
                  <PlanStatusPill
                    status={plan.status}
                    refundStatus={plan.refundStatus}
                  />
                </View>
                <PlanProgressBlock
                  paidMinor={plan.paidMinor}
                  totalMinor={plan.totalMinor}
                  currency={plan.currency}
                />
              </Pressable>
            ))
          )}
        </View>

        {past.length > 0 ? (
          <View className="gap-2">
            <AppText variant="sectionHeading">{t("pastPlans")}</AppText>
            <View className="rounded-2xl border border-border bg-card">
              {past.map((plan, index) => (
                <Pressable
                  key={plan.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/(app)/ticket-plans/${plan.id}`)}
                  className={`flex-row items-center justify-between gap-3 px-4 py-3 active:opacity-70 ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <AppText variant="small" numberOfLines={1} className="flex-1">
                    {plan.eventTitle}
                  </AppText>
                  <PlanStatusPill
                    status={plan.status}
                    refundStatus={plan.refundStatus}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
