import { useOrganizerOverview } from "@/features/organizer/useOrganizer";
import type {
  OrganizerDashboardPeriod,
  OrganizerOverviewRow,
} from "@abonten/api-client";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

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
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="text-lg font-bold text-foreground">{value}</Text>
    </View>
  );
}

function NavRow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
        <Text className="text-base text-foreground">{label}</Text>
        <Text className="text-muted-foreground">›</Text>
      </Pressable>
    </Link>
  );
}

export default function OrganizerDashboard() {
  const [period, setPeriod] = useState<OrganizerDashboardPeriod>("30d");
  const q = useOrganizerOverview(period);

  const result = q.data;
  const rows: OrganizerOverviewRow[] =
    result && result.status === 200 ? result.data.current : [];
  const head = rows[0];
  const hasEvents = n(head?.total_events_count) > 0;

  // Money is per sales currency; tickets + event counts are organiser-wide
  // and identical on every row.
  const moneyRows = rows.filter((r) => r.currency != null);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
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
              <Text
                className={
                  active
                    ? "text-xs font-semibold text-primary-foreground"
                    : "text-xs font-medium text-muted-foreground"
                }
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator />
        </View>
      ) : q.isError || (result && result.status !== 200) ? (
        <View className="items-center gap-3 py-12">
          <Text className="text-center text-muted-foreground">
            {(result && result.status !== 200 && result.message) ||
              "Couldn't load your dashboard."}
          </Text>
          <Pressable
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <Text className="font-semibold text-primary-foreground">Retry</Text>
          </Pressable>
        </View>
      ) : !hasEvents ? (
        <View className="items-center gap-3 py-12">
          <Text className="text-base font-semibold text-foreground">
            No events yet
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Publish your first event to start seeing sales here.
          </Text>
          <Link href="/(app)/event/new" asChild>
            <Pressable className="rounded-lg bg-primary px-4 py-2 active:opacity-90">
              <Text className="font-semibold text-primary-foreground">
                + Create event
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          <View className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sales
            </Text>
            {moneyRows.length === 0 ? (
              <View className="rounded-xl border border-border bg-card p-3">
                <Text className="text-sm text-muted-foreground">
                  No paid orders in this period.
                </Text>
              </View>
            ) : (
              moneyRows.map((r) => (
                <View
                  key={r.currency}
                  className="gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs uppercase text-muted-foreground">
                      Gross sales
                    </Text>
                    <Text className="text-xl font-bold text-foreground">
                      {money(r.currency, r.gross_sales)}
                    </Text>
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
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tickets
            </Text>
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
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Events
            </Text>
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
        </>
      )}

      <View className="gap-2">
        <Link href="/(app)/event/new" asChild>
          <Pressable className="items-center rounded-xl bg-primary px-4 py-3 active:opacity-90">
            <Text className="text-base font-semibold text-primary-foreground">
              + Create event
            </Text>
          </Pressable>
        </Link>
        <NavRow href="/(app)/organizer/events" label="My events" />
        <NavRow href="/(app)/organizer/finance" label="Finances" />
      </View>

      <Text className="text-center text-[11px] text-muted-foreground">
        Editing an event is still done on the Abonten website.
      </Text>
    </ScrollView>
  );
}
