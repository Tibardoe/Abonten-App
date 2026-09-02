import { DashboardWidgets } from "@/components/organizer/DashboardWidgets";
import { DashboardSkeleton } from "@/components/skeletons";
import { useEventDrafts } from "@/features/events/useEventDrafts";
import {
  useOrganizerDashboardWidgets,
  useOrganizerOverview,
} from "@/features/organizer/useOrganizer";
import { usePlaceDrafts } from "@/features/places/usePlaceDrafts";
import type {
  OrganizerDashboardPeriod,
  OrganizerOverviewRow,
} from "@abonten/api-client";
import { AppText, Overline } from "@abonten/ui-native";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

const PERIODS: { key: OrganizerDashboardPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

const n = (v: number | string | null | undefined): number => Number(v ?? 0);

function money(currency: string | null, amount: number | string): string {
  return `${currency ?? "GHS"} ${n(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Overline>{label}</Overline>
      <AppText className="text-lg font-bold text-foreground">{value}</AppText>
    </View>
  );
}

function NavRow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
        <AppText className="text-base text-foreground">{label}</AppText>
        <AppText className="text-muted-foreground">›</AppText>
      </Pressable>
    </Link>
  );
}

export default function OrganizerDashboard() {
  const [period, setPeriod] = useState<OrganizerDashboardPeriod>("30d");
  const q = useOrganizerOverview(period);
  const widgetsQuery = useOrganizerDashboardWidgets(period);
  const draftsQuery = useEventDrafts();
  const draftCount =
    draftsQuery.data?.status === 200 ? draftsQuery.data.data.length : 0;
  const placeDraftsQuery = usePlaceDrafts();
  const placeDraftCount =
    placeDraftsQuery.data?.status === 200
      ? placeDraftsQuery.data.data.length
      : 0;

  const result = q.data;
  const rows: OrganizerOverviewRow[] =
    result && result.status === 200 ? result.data.current : [];
  const head = rows[0];
  const hasEvents = n(head?.total_events_count) > 0;

  // Money is per sales currency; tickets + event counts are organiser-wide
  // and identical on every row.
  const moneyRows = rows.filter((r) => r.currency != null);
  const primaryCurrency = moneyRows[0]?.currency ?? "GHS";
  const widgets =
    widgetsQuery.data?.status === 200 ? widgetsQuery.data.data : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching || widgetsQuery.isRefetching}
          onRefresh={() => {
            q.refetch();
            widgetsQuery.refetch();
          }}
        />
      }
    >
      <View className="flex-row flex-wrap gap-2">
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              className={
                active
                  ? "rounded-full bg-primary px-3 py-1.5"
                  : "rounded-full border border-border px-3 py-1.5"
              }
            >
              <AppText
                className={
                  active
                    ? "text-[13px] font-semibold text-primary-foreground"
                    : "text-[13px] font-medium text-muted-foreground"
                }
              >
                {p.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <DashboardSkeleton />
      ) : q.isError || (result && result.status !== 200) ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {(result && result.status !== 200 && result.message) ||
              "Couldn't load your dashboard."}
          </AppText>
          <Pressable
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <AppText className="font-semibold text-primary-foreground">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : !hasEvents ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-base font-semibold text-foreground">
            No events yet
          </AppText>
          <AppText className="text-center text-sm text-muted-foreground">
            Publish your first event to start seeing sales here.
          </AppText>
          <Link href="/(app)/event/new" asChild>
            <Pressable className="rounded-lg bg-primary px-4 py-2 active:opacity-90">
              <AppText className="font-semibold text-primary-foreground">
                + Create event
              </AppText>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          <View className="gap-2">
            <Overline>Sales</Overline>
            {moneyRows.length === 0 ? (
              <View className="rounded-xl border border-border bg-card p-3">
                <AppText className="text-sm text-muted-foreground">
                  No paid orders in this period.
                </AppText>
              </View>
            ) : (
              moneyRows.map((r) => (
                <View
                  key={r.currency}
                  className="gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <View className="flex-row items-center justify-between">
                    <AppText className="text-[13px] uppercase text-muted-foreground">
                      Gross sales
                    </AppText>
                    <AppText variant="screenTitle">
                      {money(r.currency, r.gross_sales)}
                    </AppText>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Stat
                      label="Paid orders"
                      value={String(n(r.paid_orders))}
                    />
                    <Stat
                      label="Buyers"
                      value={String(n(r.distinct_purchasers))}
                    />
                    <Stat
                      label="Discounts"
                      value={money(r.currency, r.total_discount)}
                    />
                  </View>
                </View>
              ))
            )}
          </View>

          <View className="gap-2">
            <Overline>Tickets</Overline>
            <View className="flex-row flex-wrap gap-2">
              <Stat label="Sold" value={String(n(head?.tickets_sold))} />
              <Stat
                label="Registrations"
                value={String(n(head?.registrations))}
              />
              <Stat
                label="Cancelled"
                value={String(n(head?.tickets_cancelled))}
              />
            </View>
          </View>

          <View className="gap-2">
            <Overline>Events</Overline>
            <View className="flex-row flex-wrap gap-2">
              <Stat
                label="Active"
                value={String(n(head?.active_events_count))}
              />
              <Stat
                label="Upcoming"
                value={String(n(head?.upcoming_events_count))}
              />
              <Stat label="Total" value={String(n(head?.total_events_count))} />
            </View>
          </View>

          {widgets ? (
            <DashboardWidgets widgets={widgets} currency={primaryCurrency} />
          ) : null}
        </>
      )}

      <View className="gap-2">
        <Link href="/(app)/event/new" asChild>
          <Pressable className="items-center rounded-xl bg-primary px-4 py-3 active:opacity-90">
            <AppText className="text-base font-semibold text-primary-foreground">
              + Create event
            </AppText>
          </Pressable>
        </Link>
        <NavRow href="/(app)/organizer/events" label="My events" />
        {draftCount > 0 ? (
          <NavRow
            href="/(app)/organizer/event-drafts"
            label={`Event drafts (${draftCount})`}
          />
        ) : null}
        <NavRow href="/(app)/organizer/places" label="My places" />
        {placeDraftCount > 0 ? (
          <NavRow
            href="/(app)/organizer/place-drafts"
            label={`Place drafts (${placeDraftCount})`}
          />
        ) : null}
        <NavRow href="/(app)/organizer/finance" label="Finances" />
      </View>
    </ScrollView>
  );
}
