import { api } from "@/lib/api";
import type { OrganizerDashboardPeriod } from "@abonten/api-client";
import { useQuery } from "@tanstack/react-query";

const KEY = ["mobile", "organizer", "event-insights"] as const;

// Insights numbers only move when a purchase or refund settles — a short
// staleTime keeps the read cheap without feeling stale (matches useOrganizer).
const STALE_TIME = 20_000;

export function useEventInsights(
  eventId: string,
  period: OrganizerDashboardPeriod,
) {
  return useQuery({
    queryKey: [...KEY, eventId, period],
    queryFn: () => api.organizer.eventInsights(eventId, period),
    staleTime: STALE_TIME,
    enabled: !!eventId,
  });
}
