import { useOrganizerFinance } from "@/features/organizer/useOrganizer";
import type {
  DashboardBucket,
  OrganizerActivityRow,
  OrganizerAttentionRow,
  OrganizerDashboardWidgets,
  OrganizerPerformanceRow,
  OrganizerTimelineRow,
  OrganizerUpcomingRow,
} from "@abonten/api-client";
import {
  formatDateWithSuffix,
  getRelativeTime,
} from "@abonten/core/dateFormatter";
import { Icon, type IoniconName } from "@abonten/ui-native";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

// The Dashboard widget sections below the KPI cards — the native mirror of
// the web OrganizerDashboard's OrganizerFinanceSummary /
// OrganizerSalesTimelineChart / OrganizerEventPerformanceList /
// OrganizerUpcomingEvents / OrganizerNeedsAttention / OrganizerRecentActivity.
// The timeline is a proportional bar list rather than a charting lib.

const n = (v: number | string | null | undefined): number => Number(v ?? 0);

function money(currency: string | null | undefined, amount: number): string {
  return `${currency ?? "GHS"} ${amount.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

function bucketLabel(bucketStart: string, bucket: DashboardBucket): string {
  const d = new Date(bucketStart);
  if (bucket === "hour")
    return d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (bucket === "month")
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

function FinanceSummary() {
  const q = useOrganizerFinance();
  const overview =
    q.data?.status === 200 && q.data.data.length > 0 ? q.data.data[0] : null;

  if (!overview) return null;

  return (
    <Link href="/(app)/organizer/finance" asChild>
      <Pressable className="flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 active:opacity-80">
        <View className="flex-row gap-6">
          <View>
            <Text className="text-xs text-muted-foreground">
              Available to withdraw
            </Text>
            <Text className="font-bold text-foreground">
              {money(overview.currency, n(overview.available_balance))}
            </Text>
          </View>
          <View>
            <Text className="text-xs text-muted-foreground">Pending</Text>
            <Text className="font-bold text-foreground">
              {money(overview.currency, n(overview.pending_balance))}
            </Text>
          </View>
        </View>
        <Text className="shrink-0 text-sm font-medium text-primary">
          Finances ›
        </Text>
      </Pressable>
    </Link>
  );
}

function SalesTimeline({
  rows,
  bucket,
  currency,
}: {
  rows: OrganizerTimelineRow[];
  bucket: DashboardBucket;
  currency: string;
}) {
  const recent = rows.slice(-14);
  const max = Math.max(1, ...recent.map((r) => n(r.gross)));

  return (
    <View className="gap-2">
      <SectionTitle>Sales over time</SectionTitle>
      {recent.length === 0 ? (
        <View className="rounded-xl border border-border bg-card p-3">
          <Text className="text-sm text-muted-foreground">
            No sales in this period yet.
          </Text>
        </View>
      ) : (
        <View className="gap-2 rounded-xl border border-border bg-card p-4">
          {recent.map((r) => {
            const gross = n(r.gross);
            return (
              <View key={r.bucket_start} className="gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-muted-foreground">
                    {bucketLabel(r.bucket_start, bucket)}
                  </Text>
                  <Text className="text-xs text-foreground">
                    {money(currency, gross)} · {n(r.orders)} order
                    {n(r.orders) === 1 ? "" : "s"}
                  </Text>
                </View>
                <View className="h-2 overflow-hidden rounded-full bg-muted">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (gross / max) * 100)}%` }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function EventRow({
  eventId,
  title,
  subtitle,
  primary,
  secondary,
}: {
  eventId: string;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
}) {
  return (
    <Link href={`/(app)/organizer/events/${eventId}`} asChild>
      <Pressable className="flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 active:opacity-80">
        <View className="flex-1">
          <Text className="font-medium text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground">{subtitle}</Text>
        </View>
        <View className="shrink-0 items-end">
          <Text className="font-bold text-foreground">{primary}</Text>
          <Text className="text-xs text-muted-foreground">{secondary}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  ended: "Ended",
};

function EventPerformance({ events }: { events: OrganizerPerformanceRow[] }) {
  return (
    <View className="gap-2">
      <SectionTitle>Event performance</SectionTitle>
      {events.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No event sales in this period yet.
        </Text>
      ) : (
        events.map((e) => (
          <EventRow
            key={e.event_id}
            eventId={e.event_id}
            title={e.title ?? "Untitled event"}
            subtitle={`${
              e.starts_at ? formatDateWithSuffix(e.starts_at) : "Date not set"
            } · ${STATUS_LABEL[e.status ?? ""] ?? e.status ?? ""}`}
            primary={`${e.currency ? `${e.currency} ` : ""}${n(
              e.revenue,
            ).toLocaleString()}`}
            secondary={`${n(e.tickets_sold).toLocaleString()} tickets`}
          />
        ))
      )}
      <Link href="/(app)/organizer/events" asChild>
        <Text className="self-start text-sm text-primary">View all events</Text>
      </Link>
    </View>
  );
}

function UpcomingEvents({ events }: { events: OrganizerUpcomingRow[] }) {
  return (
    <View className="gap-2">
      <SectionTitle>Upcoming events</SectionTitle>
      {events.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No upcoming events in the next while.
        </Text>
      ) : (
        events.map((e) => (
          <EventRow
            key={e.event_id}
            eventId={e.event_id}
            title={e.title ?? "Untitled event"}
            subtitle={`${
              e.next_occurrence_starts_at
                ? formatDateWithSuffix(e.next_occurrence_starts_at)
                : "Date not set"
            } · ${e.status === "ongoing" ? "Ongoing" : "Upcoming"}`}
            primary={`${n(e.tickets_sold).toLocaleString()}${
              e.capacity != null ? ` / ${n(e.capacity).toLocaleString()}` : ""
            }`}
            secondary={e.capacity != null ? "sold" : "sold (no cap)"}
          />
        ))
      )}
    </View>
  );
}

function NeedsAttention({ items }: { items: OrganizerAttentionRow[] }) {
  return (
    <View className="gap-2">
      <SectionTitle>Needs attention</SectionTitle>
      {items.length === 0 ? (
        <View className="flex-row items-center gap-2">
          <Icon name="checkmark-circle-outline" tone="primary" size={18} />
          <Text className="text-sm text-muted-foreground">
            You're all caught up — nothing needs attention right now.
          </Text>
        </View>
      ) : (
        items.map((item, i) => (
          <Link
            key={`${item.event_id}-${item.rule_type}-${i}`}
            href={`/(app)/organizer/events/${item.event_id}`}
            asChild
          >
            <Pressable className="flex-row items-start gap-3 rounded-xl border border-border bg-card p-4 active:opacity-80">
              <Icon
                name="warning-outline"
                tone="destructive"
                size={20}
                style={{ marginTop: 2 }}
              />
              <View className="flex-1">
                <Text className="font-medium text-foreground" numberOfLines={1}>
                  {item.event_title ?? "Event"}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {item.message}
                </Text>
              </View>
            </Pressable>
          </Link>
        ))
      )}
    </View>
  );
}

const ACTIVITY_ICON: Record<string, IoniconName> = {
  ticket_sold: "ticket-outline",
  ticket_cancelled: "close-circle-outline",
  registration: "person-add-outline",
};

function activityVerb(type: string): string {
  if (type === "ticket_sold") return "Ticket sold for";
  if (type === "ticket_cancelled") return "Ticket cancelled for";
  return "New registration for";
}

function RecentActivity({ items }: { items: OrganizerActivityRow[] }) {
  return (
    <View className="gap-2">
      <SectionTitle>Recent activity</SectionTitle>
      {items.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No recent activity yet.
        </Text>
      ) : (
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {items.map((item, i) => (
            <View
              key={`${item.event_id}-${item.occurred_at}-${i}`}
              className={`flex-row items-center gap-3 p-3 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <Icon
                name={ACTIVITY_ICON[item.activity_type] ?? "ticket-outline"}
                tone="muted"
                size={18}
              />
              <Text
                className="flex-1 text-sm text-foreground"
                numberOfLines={1}
              >
                {activityVerb(item.activity_type)}{" "}
                {item.event_title ?? "an event"}
              </Text>
              <Text className="shrink-0 text-xs text-muted-foreground">
                {getRelativeTime(item.occurred_at)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function DashboardWidgets({
  widgets,
  currency,
}: {
  widgets: OrganizerDashboardWidgets;
  currency: string;
}) {
  return (
    <>
      <FinanceSummary />
      <SalesTimeline
        rows={widgets.timeline.rows}
        bucket={widgets.timeline.bucket}
        currency={currency}
      />
      <EventPerformance events={widgets.performance} />
      <UpcomingEvents events={widgets.upcoming} />
      <NeedsAttention items={widgets.attention} />
      <RecentActivity items={widgets.activity} />
    </>
  );
}
