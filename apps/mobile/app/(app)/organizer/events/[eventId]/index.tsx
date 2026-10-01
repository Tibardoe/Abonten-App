import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { useEventInsights } from "@/features/organizer/useEventInsights";
import { PromoterCommissionSection } from "@/features/rewards/PromoterCommissionSection";
import { IN_APP_PROMOTION_PURCHASES } from "@/lib/storePolicy";
import { useQueryView } from "@/lib/useQueryView";
import type {
  EventInsightsDateRow,
  EventInsightsFinance,
  EventInsightsOverview,
  EventInsightsPromoRow,
  EventInsightsReturning,
  EventInsightsTicketTypeRow,
  OrganizerDashboardPeriod,
} from "@abonten/api-client";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { AppText, Chip, Overline, Refresher } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

const PERIODS: { key: OrganizerDashboardPeriod; label: string }[] = [
  { key: "today", label: "periods.today" },
  { key: "7d", label: "periods.7d" },
  { key: "30d", label: "periods.30d" },
  { key: "all", label: "periods.all" },
];

// PostgREST can serialise the analytics RPCs' bigint/numeric columns as
// strings — coerce every numeric field on read (same as the dashboard).
const n = (v: number | string | null | undefined): number => Number(v ?? 0);

function money(currency: string | null | undefined, amount: number): string {
  return formatMoney(currency, amount);
}

function SectionTitle({ children }: { children: string }) {
  return <AppText variant="sectionHeading">{children}</AppText>;
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Overline>{label}</Overline>
      <AppText variant="sectionHeading">{value}</AppText>
      {sublabel ? <AppText variant="caption">{sublabel}</AppText> : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <AppText className="text-sm text-muted-foreground">{label}</AppText>
      <AppText className="text-sm font-medium text-foreground">{value}</AppText>
    </View>
  );
}

function OverviewCards({
  overview,
}: { overview: EventInsightsOverview | null }) {
  const t = useTranslations("manage");

  if (!overview) {
    return (
      <AppText className="text-sm text-muted-foreground">
        {t("noSalesOrRegistrationDataYet")}
      </AppText>
    );
  }

  const currency = overview.currency ?? "";
  const m = (amount: number) => money(currency, amount);
  const grossSales = n(overview.gross_sales);
  const promoCount = n(overview.promo_purchase_count);

  const tiles: { label: string; value: string; sublabel?: string }[] = [];

  if (overview.require_registration) {
    // Free/RSVP events lead with registrations, not a "GHS 0" sales figure.
    tiles.push({
      label: t("registrations"),
      value: String(n(overview.tickets_sold)),
    });
    tiles.push({
      label: t("attendees"),
      value: String(n(overview.distinct_attendees)),
    });
    tiles.push({
      label: t("cancelled"),
      value: String(n(overview.tickets_cancelled)),
    });
    if (overview.capacity != null) {
      tiles.push({
        label: t("remaining"),
        value: String(n(overview.capacity_remaining)),
        sublabel: `of ${overview.capacity} capacity`,
      });
    }
    if (grossSales > 0) {
      tiles.push({ label: t("grossSales"), value: m(grossSales) });
    }
    if (promoCount > 0) {
      tiles.push({ label: t("promoPurchases"), value: String(promoCount) });
    }
  } else {
    tiles.push({ label: t("grossSales"), value: m(grossSales) });
    tiles.push({
      label: t("ticketsSold"),
      value: String(n(overview.tickets_sold)),
    });
    tiles.push({
      label: t("attendees"),
      value: String(n(overview.distinct_attendees)),
    });
    tiles.push({
      label: t("cancelled"),
      value: String(n(overview.tickets_cancelled)),
    });
    tiles.push({ label: t("promoPurchases"), value: String(promoCount) });
    if (overview.capacity != null) {
      tiles.push({
        label: t("remaining"),
        value: String(n(overview.capacity_remaining)),
        sublabel: `of ${overview.capacity} capacity`,
      });
    }
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {tiles.map((t) => (
        <Stat
          key={t.label}
          label={t.label}
          value={t.value}
          sublabel={t.sublabel}
        />
      ))}
    </View>
  );
}

function FinanceSection({
  finance,
  period,
}: {
  finance: EventInsightsFinance | null;
  period: OrganizerDashboardPeriod;
}) {
  const t = useTranslations("manage");

  return (
    <View className="gap-3">
      <SectionTitle>{t("eventRevenue")}</SectionTitle>
      {!finance ? (
        <AppText className="text-sm text-muted-foreground">
          {t("noRevenueDataAvailableYet")}
        </AppText>
      ) : (
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Row
            label={t("ticketSales")}
            value={money(finance.currency, n(finance.ticketSales))}
          />
          {/* Under the customer-paid-service-fee model the organizer keeps
              100% of the ticket price; older sales that carried a 2%
              deduction still show this row. */}
          {n(finance.platformFee) !== 0 ? (
            <Row
              label={t("abontenFees")}
              value={`-${money(finance.currency, n(finance.platformFee))}`}
            />
          ) : null}
          {n(finance.refunds) !== 0 ? (
            <View className="gap-1">
              <Row
                label={t("refunds")}
                value={`-${money(finance.currency, Math.abs(n(finance.refunds)))}`}
              />
              {n(finance.pendingRefunds) > 0 ||
              n(finance.completedRefunds) > 0 ? (
                <AppText variant="muted">
                  {t("request", { n: n(finance.refundRequestCount) })}
                  {n(finance.refundRequestCount) === 1 ? "" : "s"}{" "}
                  {t("pendingCompleted", {
                    money: money(finance.currency, n(finance.pendingRefunds)),
                    money2: money(
                      finance.currency,
                      n(finance.completedRefunds),
                    ),
                  })}
                </AppText>
              ) : null}
            </View>
          ) : null}
          <Row
            label={t("netSales")}
            value={money(finance.currency, n(finance.netSales))}
          />
          {n(finance.promoterCommissions) !== 0 ? (
            <Row
              label={t("promoterCommissions")}
              value={`-${money(finance.currency, Math.abs(n(finance.promoterCommissions)))}`}
            />
          ) : null}
          <View className="h-px bg-border" />
          <Row
            label={t("organizerEarnings")}
            value={money(finance.currency, n(finance.organizerEarnings))}
          />
          <View className="h-px bg-border" />
          {period !== "all" ? (
            <AppText variant="muted">
              {t("refundBreakdownAndSettlementStatusAre")}
            </AppText>
          ) : null}
          <AppText className="text-sm font-medium text-foreground">
            {t("settlementStatus")}
            {finance.settled ? t("settled") : t("pendingSettlement")}
          </AppText>
          {finance.settled ? (
            <AppText variant="muted">
              {t("isNowAvailableInYourFinances", {
                money: money(finance.currency, n(finance.organizerEarnings)),
              })}
            </AppText>
          ) : null}
        </View>
      )}
    </View>
  );
}

function TicketTypesSection({
  rows,
}: {
  rows: EventInsightsTicketTypeRow[];
}) {
  const t = useTranslations("manage");

  return (
    <View className="gap-3">
      <SectionTitle>{t("ticketTypes2")}</SectionTitle>
      {rows.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          {t("noTicketTypesSetUpYet")}
        </AppText>
      ) : (
        <View className="gap-2">
          {rows.map((row) => {
            const capped = row.quantity_capacity != null;
            const pctSold = Math.min(100, n(row.percent_sold));
            const price = n(row.price);
            const revenue = n(row.revenue);
            const cancelled = n(row.cancelled);
            return (
              <View
                key={row.ticket_type_id}
                className="gap-2 rounded-xl border border-border bg-card p-4"
              >
                <View className="flex-row items-center justify-between gap-2">
                  <AppText className="font-semibold text-foreground">
                    {row.type}
                  </AppText>
                  <AppText className="shrink-0 text-sm text-muted-foreground">
                    {t("sold", { n: n(row.sold) })}
                    {capped ? ` / ${row.quantity_capacity}` : " / Unlimited"}
                  </AppText>
                </View>
                {capped ? (
                  <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pctSold}%` }}
                    />
                  </View>
                ) : null}
                <View className="flex-row justify-between">
                  <AppText variant="muted">
                    {price > 0
                      ? `${row.currency ?? ""} ${price.toLocaleString()}`.trim()
                      : t("free")}
                  </AppText>
                  {revenue > 0 ? (
                    <AppText variant="muted">
                      {row.currency ?? ""}{" "}
                      {t("revenue", {
                        toLocaleString: revenue.toLocaleString(),
                      })}
                    </AppText>
                  ) : null}
                  {cancelled > 0 ? (
                    <AppText variant="muted">
                      {t("cancelled2", { cancelled: cancelled })}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function PromoSection({ rows }: { rows: EventInsightsPromoRow[] }) {
  const t = useTranslations("manage");

  return (
    <View className="gap-3">
      <SectionTitle>{t("promoCodes2")}</SectionTitle>
      {rows.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          {t("noPromoCodesUsedYet")}
        </AppText>
      ) : (
        <View className="gap-2">
          {rows.map((row) => (
            <View
              key={row.promo_code}
              className="flex-row items-center justify-between gap-2 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-1">
                <AppText className="font-semibold text-foreground">
                  {row.promo_code}
                </AppText>
                <AppText variant="muted">
                  {t("ordersTicketsDiscounted", {
                    n: n(row.orders),
                    n2: n(row.units_discounted),
                  })}
                </AppText>
              </View>
              <AppText className="shrink-0 text-sm font-medium text-foreground">
                {t("discount", {
                  toLocaleString: n(row.total_discount).toLocaleString(),
                })}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function DateSection({ rows }: { rows: EventInsightsDateRow[] }) {
  const { locale } = useLocale();

  const t = useTranslations("manage");

  return (
    <View className="gap-3">
      <SectionTitle>{t("attendanceByDate")}</SectionTitle>
      <View className="gap-2">
        {rows.map((row) => {
          const label = row.starts_at
            ? formatFullDateTimeRange(
                row.starts_at,
                row.ends_at,
                undefined,
                locale,
              )
            : null;
          return (
            <View
              key={row.occurrence_id ?? "unassigned"}
              className="flex-row items-center justify-between gap-2 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-1">
                <AppText className="font-semibold text-foreground">
                  {label ? label.date : t("beforeDateTracking")}
                </AppText>
                {label ? <AppText variant="muted">{label.time}</AppText> : null}
              </View>
              <View className="shrink-0 items-end">
                <AppText className="text-sm font-medium text-foreground">
                  {t("attendees2", { n: n(row.tickets_sold) })}
                </AppText>
                {n(row.tickets_cancelled) > 0 ? (
                  <AppText variant="muted">
                    {t("cancelled3", { n: n(row.tickets_cancelled) })}
                  </AppText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ReturningSection({
  returning,
}: {
  returning: EventInsightsReturning;
}) {
  const t = useTranslations("manage");

  const ret = n(returning.returning_count);
  const first = n(returning.first_time_count);
  const total = ret + first;

  return (
    <View className="gap-3">
      <SectionTitle>{t("attendeeBehavior")}</SectionTitle>
      {total === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          {t("notEnoughAttendeesYetToCalculate")}
        </AppText>
      ) : (
        <View className="gap-2">
          <View className="h-2 w-full flex-row overflow-hidden rounded-full bg-muted">
            <View
              className="h-full bg-primary"
              style={{ width: `${(ret / total) * 100}%` }}
            />
          </View>
          <View className="flex-row justify-between">
            <AppText className="text-sm text-foreground">
              {t("returning", { round: Math.round((ret / total) * 100) })}
              <AppText className="text-muted-foreground">({ret})</AppText>
            </AppText>
            <AppText className="text-sm text-foreground">
              {t("firstTime", { round: Math.round((first / total) * 100) })}
              <AppText className="text-muted-foreground">({first})</AppText>
            </AppText>
          </View>
        </View>
      )}
    </View>
  );
}

export default function EventInsightsScreen() {
  const { locale } = useLocale();

  const t = useTranslations("manage");

  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [period, setPeriod] = useState<OrganizerDashboardPeriod>("all");
  const q = useEventInsights(eventId ?? "", period);

  const result = q.data;
  const insights = result && result.status === 200 ? result.data : null;
  // The server's own answer (not yours, no such event) keeps its message;
  // loading, offline and failed are told apart from it, and the tiles are
  // never drawn as zeros for figures the phone does not have.
  const definiteFailure = result !== undefined && result.status !== 200;
  const view = useQueryView(q);

  const dateRange = insights?.overview?.starts_at
    ? formatFullDateTimeRange(
        insights.overview.starts_at,
        insights.overview.ends_at,
        undefined,
        locale,
      )
    : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4 pb-16"
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
    >
      <View>
        <AppText variant="screenTitle">
          {insights?.overview?.event_title ?? t("eventInsights2")}
        </AppText>
        {dateRange ? (
          <AppText className="mt-1 text-sm text-muted-foreground">
            {dateRange.date} · {dateRange.time}
          </AppText>
        ) : null}
      </View>

      {eventId ? (
        <View className="flex-row gap-2">
          <Link href={`/(app)/organizer/events/${eventId}/edit`} asChild>
            <Pressable className="flex-1 items-center rounded-xl border border-primary px-4 py-2.5 active:opacity-80">
              <AppText className="text-sm font-semibold text-primary">
                {t("editEvent")}
              </AppText>
            </Pressable>
          </Link>
          {IN_APP_PROMOTION_PURCHASES ? (
            <Link href={`/(app)/organizer/events/${eventId}/promote`} asChild>
              <Pressable className="flex-1 items-center rounded-xl border border-primary px-4 py-2.5 active:opacity-80">
                <AppText className="text-sm font-semibold text-primary">
                  {t("promote")}
                </AppText>
              </Pressable>
            </Link>
          ) : null}
        </View>
      ) : null}

      {eventId ? (
        <View className="gap-2">
          <Link href={`/(app)/organizer/events/${eventId}/attendees`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("attendeesCheckIn")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/events/${eventId}/promo-codes`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("managePromoCodes")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/events/${eventId}/reviews`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                {t("reviewsReplies")}
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
        </View>
      ) : null}

      {eventId ? <PromoterCommissionSection eventId={eventId} /> : null}

      <View className="flex-row flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Chip
            key={p.key}
            label={t(p.label)}
            selected={p.key === period}
            onPress={() => setPeriod(p.key)}
          />
        ))}
      </View>

      {!definiteFailure && view.kind !== "content" && view.kind !== "empty" ? (
        <QueryUnavailable
          view={view}
          subject="this event's insights"
          onRetry={() => q.refetch()}
          loading={
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          }
        />
      ) : definiteFailure ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {result.message || t("couldnTLoadThisEventS")}
          </AppText>
          <Pressable
            accessibilityRole="button"
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <AppText className="font-semibold text-primary-foreground">
              {t("retry")}
            </AppText>
          </Pressable>
        </View>
      ) : insights ? (
        <>
          <View className="gap-3">
            <SectionTitle>{t("overview")}</SectionTitle>
            <OverviewCards overview={insights.overview} />
          </View>

          <FinanceSection finance={insights.finance} period={period} />
          <TicketTypesSection rows={insights.ticketTypes} />
          <PromoSection rows={insights.promos} />
          {insights.dates.hasOccurrences ? (
            <DateSection rows={insights.dates.rows} />
          ) : null}
          <ReturningSection returning={insights.returning} />
        </>
      ) : null}

      {eventId ? (
        <Link href={`/(app)/event/${eventId}`} asChild>
          <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
            <AppText className="text-base text-foreground">
              {t("viewPublicEventPage")}
            </AppText>
            <AppText className="text-muted-foreground">›</AppText>
          </Pressable>
        </Link>
      ) : null}
    </ScrollView>
  );
}
