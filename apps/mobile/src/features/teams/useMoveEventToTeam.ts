import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TEAMS_KEY } from "./useTeams";

// "Move to a team" for one of the person's own events (its whole run),
// while nobody has bought or registered (docs/architecture/team-accounts.md,
// "Move events into a team"). Same routes as the website's card.

export function useMoveEventToTeamOptions(eventId: string, enabled = true) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: [...TEAMS_KEY, "move-event", userId, eventId],
    enabled: !!userId && !!eventId && enabled,
    queryFn: async () =>
      settleEnvelope(await api.organizer.moveEventToTeamOptions(eventId)),
    staleTime: 30_000,
  });
}

export function useMoveEventToTeam(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) =>
      api.organizer.moveEventToTeam(eventId, { teamId }),
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: TEAMS_KEY });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
      }
    },
  });
}
