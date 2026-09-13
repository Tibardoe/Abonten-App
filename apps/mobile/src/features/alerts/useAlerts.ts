import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import type {
  NotificationPreferences,
  NotificationPreferencesPatch,
  NotificationSubscription,
  PromptContext,
  PromptOffer,
  PromptResponse,
  RecommendationItem,
  SubscriptionStatusResult,
} from "@abonten/types/discoveryType";
import { useToast } from "@abonten/ui-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDiscoveryProgram } from "../discovery/useDiscoveryProgram";

// Alerts, prompts and picks on mobile (Discovery). Every call goes through
// /api/mobile: the tables behind them have no client write access, and the
// server decides what may be offered or sent.

export const PREFS_KEY = ["mobile", "alerts", "preferences"] as const;
export const SUBS_KEY = ["mobile", "alerts", "subscriptions"] as const;
export const RECS_KEY = ["mobile", "recommendations"] as const;

export function usePromptOffer(context: PromptContext | null) {
  const { session } = useSession();
  const { program } = useDiscoveryProgram();
  return useQuery({
    queryKey: ["mobile", "alerts", "prompt", context],
    enabled: !!context && !!session && program.prompts,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async (): Promise<PromptOffer | null> => {
      if (!context) return null;
      const res = await api.alerts.prompt(context);
      return res.status === 200 && res.data ? res.data : null;
    },
  });
}

export function usePromptResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PromptResponse) => api.alerts.respondToPrompt(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBS_KEY });
      qc.invalidateQueries({ queryKey: ["mobile", "alerts", "status"] });
    },
  });
}

export function useSubscriptionStatus(
  kind: "organizer" | "place",
  targetId: string | undefined,
) {
  const { session } = useSession();
  const { program } = useDiscoveryProgram();
  return useQuery({
    queryKey: [
      "mobile",
      "alerts",
      "status",
      kind,
      targetId,
      session?.user.id ?? null,
    ],
    enabled: !!targetId && !!session && program.personalization,
    staleTime: 60_000,
    queryFn: async (): Promise<SubscriptionStatusResult> => {
      const res = await api.alerts.status(kind, targetId as string);
      return res.status === 200 && res.data
        ? res.data
        : { subscribed: false, subscriptionId: null };
    },
  });
}

export function useToggleSubscription(
  kind: "organizer" | "place",
  targetId: string | undefined,
  label: string,
  source: "profile" | "search" = "profile",
) {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSession();
  const key = [
    "mobile",
    "alerts",
    "status",
    kind,
    targetId,
    session?.user.id ?? null,
  ];
  return useMutation({
    mutationFn: async (vars: {
      next: boolean;
      subscriptionId: string | null;
    }) => {
      if (!targetId) throw new Error("missing target");
      if (vars.next) {
        return api.alerts.subscribe(
          kind === "organizer"
            ? { kind, organizerId: targetId }
            : { kind, placeId: targetId },
          source,
        );
      }
      if (!vars.subscriptionId) throw new Error("missing subscription");
      return api.alerts.unsubscribe(vars.subscriptionId);
    },
    onMutate: (vars) => {
      const previous = qc.getQueryData<SubscriptionStatusResult>(key);
      qc.setQueryData<SubscriptionStatusResult>(key, {
        subscribed: vars.next,
        subscriptionId: previous?.subscriptionId ?? null,
      });
      return { previous };
    },
    onSuccess: (res, vars, context) => {
      if (res.status !== 200) {
        qc.setQueryData(key, context?.previous);
        toast.error("Couldn't change these alerts", {
          description: res.message ?? "Please try again.",
        });
        return;
      }
      qc.setQueryData<SubscriptionStatusResult>(key, {
        subscribed: vars.next,
        subscriptionId: vars.next ? (res.data?.subscriptionId ?? null) : null,
      });
      qc.invalidateQueries({ queryKey: SUBS_KEY });
      toast.success(vars.next ? "Alerts on" : "Alerts off", {
        description: vars.next
          ? `You'll hear when ${label} posts something new.`
          : `No more new-event alerts from ${label}.`,
      });
    },
    onError: (_e, _vars, context) => {
      qc.setQueryData(key, context?.previous);
      toast.error("Couldn't change these alerts", {
        description: "Please try again.",
      });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: PREFS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<NotificationPreferences> => {
      const res = await api.alerts.preferences();
      if (res.status !== 200 || !res.data)
        throw new Error(res.message ?? "Couldn't load");
      return res.data;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) =>
      api.alerts.updatePreferences(patch),
    onMutate: (patch) => {
      const previous = qc.getQueryData<NotificationPreferences>(PREFS_KEY);
      if (previous) {
        const { pause: _pause, ...switches } = patch;
        qc.setQueryData(PREFS_KEY, { ...previous, ...switches });
      }
      return { previous };
    },
    onSuccess: (res, _patch, context) => {
      if (res.status === 200 && res.data) {
        qc.setQueryData(PREFS_KEY, res.data);
        toast.success(res.message ?? "Saved");
      } else {
        qc.setQueryData(PREFS_KEY, context?.previous);
        toast.error("Couldn't save that", {
          description: res.message ?? "Please try again.",
        });
      }
    },
    onError: (_e, _patch, context) => {
      qc.setQueryData(PREFS_KEY, context?.previous);
      toast.error("Couldn't save that", { description: "Please try again." });
    },
  });
}

export function useSubscriptions(enabled: boolean) {
  return useQuery({
    queryKey: SUBS_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<NotificationSubscription[]> => {
      const res = await api.alerts.subscriptions();
      return res.status === 200 && res.data ? res.data : [];
    },
  });
}

export function useStopSubscription() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (subscriptionId: string) =>
      api.alerts.unsubscribe(subscriptionId),
    onSuccess: (res, subscriptionId) => {
      if (res.status === 200) {
        qc.setQueryData<NotificationSubscription[]>(SUBS_KEY, (list) =>
          (list ?? []).filter((s) => s.id !== subscriptionId),
        );
        qc.invalidateQueries({ queryKey: ["mobile", "alerts", "status"] });
        toast.success("Alerts off");
      } else {
        toast.error("Couldn't turn these alerts off", {
          description: res.message ?? undefined,
        });
      }
    },
    onError: () => toast.error("Couldn't turn these alerts off"),
  });
}

export function useRecommendations() {
  const { session } = useSession();
  return useQuery({
    queryKey: RECS_KEY,
    enabled: !!session,
    staleTime: 60_000,
    queryFn: async (): Promise<RecommendationItem[]> => {
      const res = await api.recommendations.list();
      if (res.status !== 200)
        throw new Error(res.message ?? "Couldn't load your picks");
      return res.data ?? [];
    },
  });
}

export function useDismissRecommendation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (item: RecommendationItem) =>
      api.recommendations.dismiss(item.subjectType, item.subjectId),
    onMutate: (item) => {
      const previous = qc.getQueryData<RecommendationItem[]>(RECS_KEY);
      qc.setQueryData<RecommendationItem[]>(RECS_KEY, (list) =>
        (list ?? []).filter((i) => i.id !== item.id),
      );
      return { previous };
    },
    onSuccess: (res, _item, context) => {
      if (res.status === 200) {
        toast.success("Got it", { description: res.message ?? undefined });
      } else {
        qc.setQueryData(RECS_KEY, context?.previous);
        toast.error("Couldn't save that");
      }
    },
    onError: (_e, _item, context) => {
      qc.setQueryData(RECS_KEY, context?.previous);
      toast.error("Couldn't save that");
    },
  });
}
