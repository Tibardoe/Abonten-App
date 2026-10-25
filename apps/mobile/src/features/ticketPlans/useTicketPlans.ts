import { useSession } from "@/auth/SessionProvider";
import { referralHintForEvent } from "@/features/rewards/referralCapture";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import type { PayTicketPlanPartBody } from "@abonten/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Pay small small for the app (docs/architecture/ticket-plans.md). Every
// read and write goes through /api/mobile/ticket-plans (the plan tables are
// service-role only). Keys carry the signed-in user, and nothing here is in
// the persisted-query allowlist: a plan is money, never shown from a stale
// cache file.

export const TICKET_PLANS_KEY = ["mobile", "ticket-plans"] as const;

function useUserId(): string | null {
  const { session } = useSession();
  return session?.user.id ?? null;
}

/** Whether this event can be paid small small (shown on the Buy screen). */
export function useTicketPlanOffer(
  eventId: string | undefined,
  occurrenceId: string | null,
) {
  const userId = useUserId();
  return useQuery({
    queryKey: [...TICKET_PLANS_KEY, "offer", userId, eventId, occurrenceId],
    enabled: !!eventId,
    queryFn: async () =>
      settleEnvelope(
        await api.ticketPlans.offer(eventId as string, occurrenceId),
      ),
    staleTime: 60_000,
    retry: 0,
  });
}

export function useStartTicketPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      occurrenceId: string | null;
      quantities: Record<string, number>;
    }) =>
      api.ticketPlans.start({
        ...input,
        referral: await referralHintForEvent(input.eventId).catch(() => null),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TICKET_PLANS_KEY });
    },
  });
}

export function ticketPlanKey(userId: string | null, planId: string) {
  return [...TICKET_PLANS_KEY, "plan", userId, planId] as const;
}

/** One plan; asks again every few seconds while its tickets are issued. */
export function useTicketPlan(planId: string | undefined) {
  const userId = useUserId();
  return useQuery({
    queryKey: ticketPlanKey(userId, planId ?? ""),
    enabled: !!planId && !!userId,
    queryFn: async () =>
      settleEnvelope(await api.ticketPlans.get(planId as string)),
    refetchInterval: (q) => {
      const res = q.state.data;
      return res?.status === 200 && res.data?.status === "settling"
        ? 4_000
        : false;
    },
  });
}

export function usePayTicketPlanPart(planId: string) {
  return useMutation({
    mutationFn: (body: PayTicketPlanPartBody) =>
      api.ticketPlans.pay(planId, body),
  });
}

export function useCancelTicketPlan(planId: string) {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: () => api.ticketPlans.cancel(planId),
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.setQueryData(ticketPlanKey(userId, planId), res);
      }
      void qc.invalidateQueries({ queryKey: TICKET_PLANS_KEY });
    },
  });
}

/** The Balance screen: money put towards tickets, plans and credit. */
export function useBalance() {
  const userId = useUserId();
  return useQuery({
    queryKey: [...TICKET_PLANS_KEY, "balance", userId],
    enabled: !!userId,
    queryFn: async () => settleEnvelope(await api.ticketPlans.balance()),
    staleTime: 30_000,
  });
}

/** The organizer's switch for one event. */
export function useEventTicketPlans(eventId: string | undefined) {
  const userId = useUserId();
  return useQuery({
    queryKey: [...TICKET_PLANS_KEY, "event", userId, eventId],
    enabled: !!eventId && !!userId,
    queryFn: async () =>
      settleEnvelope(await api.organizer.eventTicketPlans(eventId as string)),
    staleTime: 30_000,
  });
}

export function useSetEventTicketPlans(eventId: string) {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.organizer.setEventTicketPlans(eventId, enabled),
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.setQueryData([...TICKET_PLANS_KEY, "event", userId, eventId], res);
      }
    },
  });
}
