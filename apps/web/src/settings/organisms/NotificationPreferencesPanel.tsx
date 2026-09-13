"use client";

import { getNotificationPreferences } from "@/actions/discovery/getNotificationPreferences";
import { listNotificationSubscriptions } from "@/actions/discovery/listNotificationSubscriptions";
import { unsubscribeFromAlerts } from "@/actions/discovery/unsubscribeFromAlerts";
import { updateNotificationPreferences } from "@/actions/discovery/updateNotificationPreferences";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { Skeleton } from "@/components/ui/skeleton";
import { useDiscoveryProgram } from "@/hooks/useDiscoveryProgram";
import { useToast } from "@/hooks/useToast";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type {
  NotificationPreferences,
  NotificationPreferencesPatch,
  NotificationSubscription,
} from "@abonten/types/discoveryType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  IoCalendarOutline,
  IoLockClosedOutline,
  IoStorefrontOutline,
} from "react-icons/io5";

// Settings › Notifications. Only optional notices have a switch. Tickets,
// payments, refunds, cancellations, security and verification decisions
// are listed as always on: they are part of the service. Every change is
// saved at once and re-checked when a notice is sent, so nothing already
// queued slips through after an opt-out.

const PREFS_KEY = ["notification-preferences"] as const;
const SUBS_KEY = ["notification-subscriptions"] as const;

function Switch({
  id,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Row({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div>
        <p id={`${id}-label`} className="font-medium">
          {title}
        </p>
        <p
          id={`${id}-description`}
          className="mt-1 text-sm text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border px-5">
      <h2 className="border-b border-border py-4 text-base font-semibold">
        {title}
      </h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function SubscriptionRow({
  sub,
  onStop,
  pending,
}: {
  sub: NotificationSubscription;
  onStop: () => void;
  pending: boolean;
}) {
  const href =
    sub.kind === "organizer" && sub.targetSlug
      ? `/user/${sub.targetSlug}/posts`
      : sub.kind === "place" && sub.targetSlug
        ? `/places/${sub.targetSlug}`
        : null;
  const image = sub.imagePublicId
    ? buildCloudinaryUrl(sub.imagePublicId, sub.imageVersion, {
        width: 40,
        height: 40,
      })
    : null;
  const kindLabel =
    sub.kind === "organizer"
      ? "New events"
      : sub.kind === "place"
        ? "Updates from this place"
        : sub.kind === "similar_events"
          ? "Similar events"
          : "Similar places";

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        ) : sub.kind === "similar_places" || sub.kind === "place" ? (
          <IoStorefrontOutline aria-hidden />
        ) : (
          <IoCalendarOutline aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className="block truncate font-medium hover:text-primary"
          >
            {sub.label}
          </Link>
        ) : (
          <p className="truncate font-medium">{sub.label}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {kindLabel}
          {sub.status === "paused"
            ? ' · Paused after several "Not interested"'
            : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={pending}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
      >
        Stop alerts
      </button>
    </div>
  );
}

export default function NotificationPreferencesPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const { program } = useDiscoveryProgram();

  const prefs = useQuery({
    queryKey: PREFS_KEY,
    queryFn: async () => {
      const res = await getNotificationPreferences();
      if (res.status !== 200 || !("data" in res) || !res.data) {
        throw new Error(res.message ?? "Couldn't load your settings.");
      }
      return res.data;
    },
    staleTime: 30_000,
  });

  const subs = useQuery({
    queryKey: SUBS_KEY,
    queryFn: async () => {
      const res = await listNotificationSubscriptions();
      return res.status === 200 && "data" in res && res.data ? res.data : [];
    },
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) =>
      updateNotificationPreferences(patch),
    onMutate: (patch) => {
      const previous = qc.getQueryData<NotificationPreferences>(PREFS_KEY);
      if (previous) {
        const { pause: _pause, ...switches } = patch;
        qc.setQueryData(PREFS_KEY, { ...previous, ...switches });
      }
      return { previous };
    },
    onSuccess: (res, _patch, context) => {
      if (res.status === 200 && "data" in res && res.data) {
        qc.setQueryData(PREFS_KEY, res.data);
        toast.success(res.message ?? "Saved.");
      } else {
        qc.setQueryData(PREFS_KEY, context?.previous);
        toast.error(res.message ?? "Couldn't save that. Please try again.");
      }
    },
    onError: (_e, _patch, context) => {
      qc.setQueryData(PREFS_KEY, context?.previous);
      toast.error("Couldn't save that. Please try again.");
    },
  });

  const stop = useMutation({
    mutationFn: (subscriptionId: string) =>
      unsubscribeFromAlerts({ subscriptionId }),
    onSuccess: (res, subscriptionId) => {
      if (res.status === 200) {
        qc.setQueryData<NotificationSubscription[]>(SUBS_KEY, (list) =>
          (list ?? []).filter((s) => s.id !== subscriptionId),
        );
        qc.invalidateQueries({ queryKey: ["alert-subscription"] });
        toast.success("Alerts turned off.");
      } else {
        toast.error(res.message ?? "Couldn't turn these alerts off.");
      }
    },
    onError: () => toast.error("Couldn't turn these alerts off."),
  });

  if (prefs.isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        {["a", "b", "c"].map((k) => (
          <Skeleton key={k} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (prefs.isError || !prefs.data) {
    return (
      <InlineErrorRetry
        message="Couldn't load your notification settings."
        onRetry={() => prefs.refetch()}
      />
    );
  }

  const p = prefs.data;
  const followed = subs.data ?? [];
  const showFollowing = program.personalization || followed.length > 0;
  const pausedUntil = p.pausedUntil ? new Date(p.pausedUntil) : null;

  return (
    <div className="space-y-6">
      {showFollowing ? (
        <Section title="Alerts and picks">
          <Row
            id="organizer-alerts"
            title="New events from organizers you follow"
            description="A push when someone you tapped “Notify me” on posts a new event."
            checked={p.organizerAlertsPush}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ organizerAlertsPush: v })}
          />
          <Row
            id="place-updates"
            title="Updates from places you follow"
            description="New events at places you asked to hear from."
            checked={p.placeUpdatesPush}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ placeUpdatesPush: v })}
          />
          <Row
            id="recommendations"
            title="Similar events and places"
            description="Picks like the ones you said you enjoy. At most one push a day, never at night."
            checked={p.recommendationsPush}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ recommendationsPush: v })}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">Take a break</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pausedUntil
                  ? `Alerts and picks are paused until ${pausedUntil.toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`
                  : "Pause alerts and picks for two weeks. Tickets and payments still reach you."}
              </p>
            </div>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({ pause: pausedUntil ? "resume" : "two_weeks" })
              }
              className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {pausedUntil ? "Resume now" : "Pause for 2 weeks"}
            </button>
          </div>
        </Section>
      ) : null}

      {showFollowing ? (
        <Section title="What you follow">
          {subs.isLoading ? (
            <div className="py-4">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : followed.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              You don't follow anyone yet. Tap “Notify me” on an organizer's
              profile, or turn on alerts after you get a ticket.
            </p>
          ) : (
            followed.map((sub) => (
              <SubscriptionRow
                key={sub.id}
                sub={sub}
                pending={stop.isPending && stop.variables === sub.id}
                onStop={() => stop.mutate(sub.id)}
              />
            ))
          )}
        </Section>
      ) : null}

      <Section title="Messages and activity">
        <Row
          id="social"
          title="Messages, reviews and bookings"
          description="Push for new messages, reviews of your events or places, replies and booking updates. You'll still see them in Notifications."
          checked={p.socialPush}
          disabled={save.isPending}
          onChange={(v) => save.mutate({ socialPush: v })}
        />
      </Section>

      <Section title="Email">
        <Row
          id="reward-emails"
          title="Email me when credit is ready"
          description={
            p.email
              ? `To ${p.email}. At most one email every 12 hours.`
              : "Your account has no email address, so you'll get these in the app only."
          }
          checked={p.rewardEmails && !!p.email}
          disabled={save.isPending || !p.email}
          onChange={(v) => save.mutate({ rewardEmails: v })}
        />
      </Section>

      <section className="rounded-xl border border-border bg-muted/40 p-5">
        <div className="flex items-start gap-3">
          <IoLockClosedOutline
            aria-hidden
            className="mt-0.5 text-lg text-muted-foreground"
          />
          <div>
            <p className="font-medium">Always on</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tickets, payments, refunds, event cancellations, account security
              and verification decisions. These are part of the service, so they
              can't be turned off. To stop all push notifications, use your
              device settings.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
