"use client";

import { getTeam } from "@/actions/teams/getTeam";
import { getTeamsOverview } from "@/actions/teams/getTeamsOverview";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export const TEAMS_KEY = ["teams"] as const;

/** The person's teams, the invitations waiting for them, and the switch. */
export function useTeamsOverview() {
  return useQuery({
    queryKey: [...TEAMS_KEY, "overview"],
    queryFn: async () => {
      const res = answerOrThrow(await getTeamsOverview());
      return res.status === 200 && "data" in res && res.data ? res.data : null;
    },
    staleTime: 15_000,
  });
}

/** One team; null when the person is not (or no longer) a member. */
export function useTeam(teamId: string) {
  return useQuery({
    queryKey: [...TEAMS_KEY, "team", teamId],
    queryFn: async () => {
      const res = answerOrThrow(await getTeam({ teamId }));
      return res.status === 200 && "data" in res && res.data ? res.data : null;
    },
    staleTime: 10_000,
  });
}

/** After any change to a team: every team query and the server pages. */
export function useRefreshTeams() {
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: TEAMS_KEY });
    router.refresh();
  }, [qc, router]);
}
