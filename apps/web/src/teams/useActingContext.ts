"use client";

import { getActingContext } from "@/actions/teams/getActingContext";
import { setActingTeam } from "@/actions/teams/setActingTeam";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { type TeamCapability, teamRoleCan } from "@abonten/core/teams/roles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export const ACTING_KEY = ["teams", "acting"] as const;

/**
 * "Managing as": the teams the person can manage as and the chosen one
 * (null = their own account). Signed out or with no team, `teams` is empty
 * and nothing about teams is shown.
 */
export function useActingContext(enabled = true) {
  const query = useQuery({
    queryKey: ACTING_KEY,
    enabled,
    queryFn: async () => {
      const res = answerOrThrow(await getActingContext());
      return res.status === 200 && "data" in res && res.data ? res.data : null;
    },
    staleTime: 60_000,
  });
  const current = query.data?.current ?? null;
  /** Whether the chosen account may do this (always, for the person). */
  const can = useCallback(
    (...caps: TeamCapability[]) =>
      !current || caps.some((c) => teamRoleCan(current.role, c)),
    [current],
  );
  return {
    teams: query.data?.teams ?? [],
    current,
    can,
    isPending: query.isPending,
  };
}

/** Switches "Managing as", then reloads everything the choice changes. */
export function useSwitchActingTeam() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("teams");
  return useCallback(
    async (teamId: string | null) => {
      const res = await setActingTeam({ teamId }).catch(actionUnreachable);
      if (res.status !== 200) {
        toast.error(res.message ?? t("couldNotDo"));
        return;
      }
      // Every organizer and place list belongs to whoever is managed now.
      await qc.resetQueries();
      router.refresh();
    },
    [qc, router, toast, t],
  );
}
