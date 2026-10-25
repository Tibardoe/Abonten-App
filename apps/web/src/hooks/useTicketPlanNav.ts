"use client";

import { getTicketPlanNav } from "@/actions/ticketPlans/getTicketPlanNav";
import { takeShellSlice } from "@/hooks/shellBootstrap";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DISABLED_TICKET_PLAN_NAV } from "@abonten/types/ticketPlanType";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const TICKET_PLAN_NAV_KEY = "ticket-plan-nav";

// Whether the current visitor may start Pay small small plans, and how many
// they have running: the header's Balance link shows for either. Keyed by
// user; the first answer comes from the shell bootstrap.
export function useTicketPlanNav() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [TICKET_PLAN_NAV_KEY, user?.id ?? null],
    enabled: !userLoading,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "ticketPlanNav",
        user?.id ?? null,
        queryKey,
      );
      if (shared !== undefined) return shared;
      return (await getTicketPlanNav()).data;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, nav: query.data ?? DISABLED_TICKET_PLAN_NAV };
}
