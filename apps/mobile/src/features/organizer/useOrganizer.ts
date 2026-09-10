import { api } from "@/lib/api";
import type {
  OrganizerDashboardPeriod,
  OrganizerLedgerTransactionRow,
  UserPostType,
} from "@abonten/api-client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

const KEY = ["mobile", "organizer"] as const;

// The dashboard/finance numbers move only when a purchase or refund settles;
// a short staleTime keeps the read-only surfaces cheap without feeling stale.
const STALE_TIME = 20_000;

export function useOrganizerOverview(
  period: OrganizerDashboardPeriod,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...KEY, "overview", period],
    queryFn: () => api.organizer.overview(period),
    staleTime: STALE_TIME,
    enabled: options?.enabled ?? true,
  });
}

export function useOrganizerFinance() {
  return useQuery({
    queryKey: [...KEY, "finance"],
    queryFn: () => api.organizer.finance(),
    staleTime: STALE_TIME,
  });
}

// The whole Dashboard screen — KPI overview plus every widget section
// (sales timeline, event performance, upcoming events, needs attention,
// recent activity) — in one request, which the API serves from one
// database round trip. The screen used to issue this AND useOrganizerOverview
// for the same period; the KPIs now ride along as `data.overview`.
export function useOrganizerDashboardWidgets(period: OrganizerDashboardPeriod) {
  return useQuery({
    queryKey: [...KEY, "dashboard-widgets", period],
    queryFn: () => api.organizer.dashboardWidgets(period),
    staleTime: STALE_TIME,
    // Switching period should keep the previous numbers on screen rather
    // than flash the skeleton — the cards animate to the new values.
    placeholderData: (prev) => prev,
  });
}

export function useOrganizerEvents() {
  return useInfiniteQuery({
    queryKey: [...KEY, "events"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.organizer.events({ cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

export function useOrganizerLedger() {
  return useInfiniteQuery({
    queryKey: [...KEY, "ledger"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.organizer.ledger({ cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

export function flattenOrganizerEvents(
  pages: { data: UserPostType[] }[] | undefined,
): UserPostType[] {
  return pages?.flatMap((p) => p.data) ?? [];
}

export function flattenOrganizerLedger(
  pages: { data: OrganizerLedgerTransactionRow[] }[] | undefined,
): OrganizerLedgerTransactionRow[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
