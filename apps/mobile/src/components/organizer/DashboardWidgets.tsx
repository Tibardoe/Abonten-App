import { OrganizerEventCard } from "@/components/organizer/OrganizerEventCard";
import { SalesTimelineChart } from "@/components/organizer/SalesTimelineChart";
import { useOrganizerFinance } from "@/features/organizer/useOrganizer";
import type {
  OrganizerActivityRow,
  OrganizerAttentionRow,
  OrganizerDashboardWidgets,
  OrganizerPerformanceRow,
  OrganizerUpcomingRow,
} from "@abonten/api-client";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { AppText, Icon, type IoniconName, Overline } from "@abonten/ui-native";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";

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
            <AppText variant="caption">Available to withdraw</AppText>
            <AppText variant="cardTitle">
              {money(overview.currency, n(overview.available_balance))}
            </AppText>
          </View>
          <View>
            <AppText variant="caption">Pending</AppText>
            <AppText variant="cardTitle">
              {money(overview.currency, n(overview.pending_balance))}
            </AppText>
          </View>
        </View>
        <AppText variant="small" tone="brand" className="shrink-0 font-medium">
          Finances ›
        </AppText>
      </Pressable>
    </Link>
  );
}

function EventPerformance({ events }: { events: OrganizerPerformanceRow[] }) {
  return (
    <View className="gap-2.5">
      <Overline>Event performance</Overline>
      {events.length === 0 ? (
        <View className="items-center gap-1 rounded-2xl border border-border bg-card px-3 py-6">
          <Icon name="bar-chart-outline" size={20} tone="muted" />
          <AppText variant="muted" className="text-center">
            No event sales in this period yet.
          </AppText>
        </View>
      ) : (
        events.map((e) => (
          <OrganizerEventCard
            key={e.event_id}
            variant="performance"
            eventId={e.event_id}
            title={e.title}
            date={e.starts_at}
            status={e.status}
            currency={e.currency}
            revenue={e.revenue}
            ticketsSold={e.tickets_sold}
          />
        ))
      )}
      <Link href="/(app)/organizer/events" asChild>
        <AppText
          variant="small"
          tone="brand"
          className="self-start font-medium"
        >
          View all events
        </AppText>
      </Link>
    </View>
  );
}

function UpcomingEvents({ events }: { events: OrganizerUpcomingRow[] }) {
  return (
    <View className="gap-2.5">
      <Overline>Upcoming events</Overline>
      {events.length === 0 ? (
        <View className="items-center gap-1 rounded-2xl border border-border bg-card px-3 py-6">
          <Icon name="calendar-outline" size={20} tone="muted" />
          <AppText variant="muted" className="text-center">
            No upcoming events in the next while.
          </AppText>
        </View>
      ) : (
        events.map((e) => (
          <OrganizerEventCard
            key={e.event_id}
            variant="upcoming"
            eventId={e.event_id}
            title={e.title}
            date={e.next_occurrence_starts_at}
            status={e.status}
            ticketsSold={e.tickets_sold}
            capacity={e.capacity}
          />
        ))
      )}
    </View>
  );
}

function NeedsAttention({ items }: { items: OrganizerAttentionRow[] }) {
  return (
    <View className="gap-2">
      <Overline>Needs attention</Overline>
      {items.length === 0 ? (
        <View className="flex-row items-center gap-2">
          <Icon name="checkmark-circle-outline" tone="primary" size={18} />
          <AppText variant="muted">
            You're all caught up — nothing needs attention right now.
          </AppText>
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
                <AppText
                  variant="body"
                  className="font-medium"
                  numberOfLines={1}
                >
                  {item.event_title ?? "Event"}
                </AppText>
                <AppText variant="muted">{item.message}</AppText>
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
      <Overline>Recent activity</Overline>
      {items.length === 0 ? (
        <AppText variant="muted">No recent activity yet.</AppText>
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
              <AppText variant="small" className="flex-1" numberOfLines={1}>
                {activityVerb(item.activity_type)}{" "}
                {item.event_title ?? "an event"}
              </AppText>
              <AppText variant="caption" className="shrink-0">
                {getRelativeTime(item.occurred_at)}
              </AppText>
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
      <SalesTimelineChart
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
