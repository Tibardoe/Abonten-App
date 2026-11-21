import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { supabase } from "@/lib/supabase";
import type {
  AddEventShowsBody,
  AddShowPassBody,
  EventShow,
} from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Runs of shows (docs/architecture/show-runs.md). The run's upcoming shows
// are a public read (get_event_shows); adding shows or making a copy goes
// through POST /api/mobile/organizer/events/:id/shows, which runs the same
// addEventShowsCore as the website.

export function useEventShows(eventId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["mobile", "event-shows", eventId],
    enabled: !!eventId && enabled,
    queryFn: async (): Promise<EventShow[]> => {
      const { data, error } = await supabase.rpc("get_event_shows", {
        p_event_id: eventId as string,
      });
      if (error) throw error;
      return (data ?? []) as EventShow[];
    },
    staleTime: 30_000,
  });
}

export function useAddEventShows(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddEventShowsBody) =>
      api.organizer.addEventShows(eventId, body),
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: ["mobile", "event-shows"] });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
      }
    },
  });
}

/** Sells a pass on every show of the run still to come (show-passes.md). */
export function useAddShowPass(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddShowPassBody) =>
      api.organizer.addShowPass(eventId, body),
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
      }
    },
  });
}

/**
 * The account's other runs that could join this listing's run, and the
 * join itself (show-runs.md §2b); acts for the chosen team like the rest.
 */
export function useJoinableRuns(eventId: string, enabled = true) {
  return useQuery({
    queryKey: ["mobile", "event-shows", "joinable", eventId],
    enabled: !!eventId && enabled,
    queryFn: async () =>
      settleEnvelope(await api.organizer.joinableRuns(eventId)),
    staleTime: 30_000,
  });
}

export function useJoinEventRuns(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otherEventId: string) =>
      api.organizer.joinEventRuns(eventId, { otherEventId }),
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: ["mobile", "event-shows"] });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
      }
    },
  });
}
