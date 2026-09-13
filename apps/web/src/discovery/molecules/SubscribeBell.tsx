"use client";

import { getAlertSubscriptionStatus } from "@/actions/discovery/getAlertSubscriptionStatus";
import { subscribeToAlerts } from "@/actions/discovery/subscribeToAlerts";
import { unsubscribeFromAlerts } from "@/actions/discovery/unsubscribeFromAlerts";
import { cn } from "@/components/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDiscoveryProgram } from "@/hooks/useDiscoveryProgram";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/useToast";
import type { SubscriptionStatusResult } from "@abonten/types/discoveryType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IoNotifications, IoNotificationsOutline } from "react-icons/io5";

// The private "Notify me" bell for an organizer or a place. There is no
// public follower count: turning it on only means "tell me when they post
// something new". Hidden entirely while alerts are not available to the
// visitor; signed-out visitors are sent to sign in.

export default function SubscribeBell({
  kind,
  targetId,
  label,
  ownerId,
  className,
  compact = false,
}: {
  kind: "organizer" | "place";
  targetId: string;
  /** "@username" or the place name, for the accessible label and toasts. */
  label: string;
  /** Hide the bell on your own profile or place. */
  ownerId?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const { program } = useDiscoveryProgram();
  const { data: user } = useCurrentUser();
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["alert-subscription", kind, targetId, user?.id ?? null];

  const { data: status } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<SubscriptionStatusResult> => {
      const res = await getAlertSubscriptionStatus({ kind, targetId });
      return "data" in res && res.data
        ? res.data
        : { subscribed: false, subscriptionId: null };
    },
    enabled: program.personalization && !!user,
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) {
        const target =
          kind === "organizer"
            ? { kind, organizerId: targetId }
            : { kind, placeId: targetId };
        return subscribeToAlerts({ target, source: "profile" });
      }
      return unsubscribeFromAlerts({
        subscriptionId: status?.subscriptionId,
      });
    },
    onMutate: (next) => {
      const previous = qc.getQueryData<SubscriptionStatusResult>(key);
      qc.setQueryData<SubscriptionStatusResult>(key, {
        subscribed: next,
        subscriptionId: previous?.subscriptionId ?? null,
      });
      return { previous };
    },
    onSuccess: (res, next, context) => {
      if (res.status !== 200) {
        qc.setQueryData(key, context?.previous);
        toast.error(res.message ?? "Couldn't change these alerts.");
        return;
      }
      const subscriptionId =
        next && "data" in res && res.data && "subscriptionId" in res.data
          ? (res.data.subscriptionId as string)
          : null;
      qc.setQueryData<SubscriptionStatusResult>(key, {
        subscribed: next,
        subscriptionId,
      });
      qc.invalidateQueries({ queryKey: ["notification-subscriptions"] });
      toast.success(
        next
          ? `You'll hear when ${label} posts something new.`
          : `Alerts from ${label} turned off.`,
      );
    },
    onError: (_e, _next, context) => {
      qc.setQueryData(key, context?.previous);
      toast.error("Couldn't change these alerts. Please try again.");
    },
  });

  if (!program.personalization) return null;
  if (user && ownerId && user.id === ownerId) return null;

  const on = !!status?.subscribed;
  const text = on ? "Notifying" : "Notify me";

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={
        on
          ? `Stop new-event alerts from ${label}`
          : `Get new-event alerts from ${label}`
      }
      disabled={toggle.isPending}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!(await requireAuth())) return;
        toggle.mutate(!on);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-foreground hover:bg-accent",
        className,
      )}
    >
      {on ? (
        <IoNotifications aria-hidden className="text-base" />
      ) : (
        <IoNotificationsOutline aria-hidden className="text-base" />
      )}
      {compact ? null : text}
    </button>
  );
}
