import { AppHeader } from "@/components/app/AppHeader";
import {
  useNotificationPreferences,
  useStopSubscription,
  useSubscriptions,
  useUpdateNotificationPreferences,
} from "@/features/alerts/useAlerts";
import { useDiscoveryProgram } from "@/features/discovery/useDiscoveryProgram";
import type { NotificationSubscription } from "@abonten/types/discoveryType";
import {
  AppText,
  Avatar,
  Button,
  Card,
  EmptyState,
  Icon,
  Refresher,
  Skeleton,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Switch, View } from "react-native";

// Settings › Notifications: the native echo of the web preference centre.
// Only optional notices have a switch; tickets, payments, refunds,
// cancellations, security and verification decisions are always on. Each
// change saves at once and is checked again when a notice is sent.

function Row({
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-3">
      <View className="flex-1 gap-0.5">
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small" tone="muted">
          {description}
        </AppText>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </View>
  );
}

const KIND_LABEL: Record<NotificationSubscription["kind"], string> = {
  organizer: "New events",
  place: "Updates from this place",
  similar_events: "Similar events",
  similar_places: "Similar places",
};

export default function NotificationSettings() {
  const t = useTranslations("settings");
  const router = useRouter();
  const { program } = useDiscoveryProgram();
  const prefs = useNotificationPreferences();
  const save = useUpdateNotificationPreferences();
  const subs = useSubscriptions(true);
  const stop = useStopSubscription();
  const [osPushOff, setOsPushOff] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((s) => setOsPushOff(!s.granted))
      .catch(() => {});
  }, []);

  const p = prefs.data;
  const followed = subs.data ?? [];
  const showFollowing = program.personalization || followed.length > 0;
  const pausedUntil = p?.pausedUntil ? new Date(p.pausedUntil) : null;

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("nav.notifications")}
        backFallback="/(app)/settings"
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-16"
        refreshControl={
          <Refresher
            refreshing={prefs.isRefetching || subs.isRefetching}
            onRefresh={() => {
              prefs.refetch();
              subs.refetch();
            }}
          />
        }
      >
        {osPushOff ? (
          <Card className="flex-row items-center gap-3">
            <Icon name="notifications-off-outline" size={20} tone="warning" />
            <AppText variant="small" className="flex-1">
              Notifications are turned off for Abonten on this phone, so nothing
              below can reach you.
            </AppText>
            <Button
              title="Open settings"
              size="sm"
              variant="outline"
              onPress={() => Linking.openSettings()}
            />
          </Card>
        ) : null}

        {prefs.isLoading ? (
          <View className="gap-3">
            {["a", "b", "c"].map((k) => (
              <Skeleton key={k} width="100%" height={96} radius={16} />
            ))}
          </View>
        ) : prefs.isError || !p ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your settings"
            description="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => prefs.refetch()}
          />
        ) : (
          <>
            {showFollowing ? (
              <Card className="gap-0">
                <AppText variant="cardTitle" className="pb-1">
                  Alerts and picks
                </AppText>
                <Row
                  title="New events from organizers you follow"
                  description="When someone you tapped Notify me on posts a new event."
                  value={p.organizerAlertsPush}
                  disabled={save.isPending}
                  onChange={(v) => save.mutate({ organizerAlertsPush: v })}
                />
                <Row
                  title="Updates from places you follow"
                  description="New events at places you asked to hear from."
                  value={p.placeUpdatesPush}
                  disabled={save.isPending}
                  onChange={(v) => save.mutate({ placeUpdatesPush: v })}
                />
                <Row
                  title="Similar events and places"
                  description="Picks like the ones you enjoy. At most one a day, never at night."
                  value={p.recommendationsPush}
                  disabled={save.isPending}
                  onChange={(v) => save.mutate({ recommendationsPush: v })}
                />
                <View className="gap-2 py-3">
                  <AppText variant="bodyStrong">Take a break</AppText>
                  <AppText variant="small" tone="muted">
                    {pausedUntil
                      ? `Alerts and picks are paused until ${pausedUntil.toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`
                      : "Pause alerts and picks for two weeks. Tickets and payments still reach you."}
                  </AppText>
                  <Button
                    title={pausedUntil ? "Resume now" : "Pause for 2 weeks"}
                    variant="outline"
                    size="sm"
                    disabled={save.isPending}
                    onPress={() =>
                      save.mutate({
                        pause: pausedUntil ? "resume" : "two_weeks",
                      })
                    }
                  />
                </View>
              </Card>
            ) : null}

            {showFollowing ? (
              <Card className="gap-2">
                <AppText variant="cardTitle">What you follow</AppText>
                {subs.isLoading ? (
                  <Skeleton width="100%" height={44} />
                ) : followed.length === 0 ? (
                  <AppText variant="small" tone="muted">
                    You don't follow anyone yet. Tap Notify me on an organizer's
                    profile, or turn on alerts after you get a ticket.
                  </AppText>
                ) : (
                  followed.map((sub) => (
                    <View
                      key={sub.id}
                      className="flex-row items-center gap-3 py-1.5"
                    >
                      {sub.kind === "organizer" ? (
                        <Avatar
                          publicId={sub.imagePublicId ?? undefined}
                          version={sub.imageVersion ?? undefined}
                          size={36}
                        />
                      ) : (
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
                          <Icon
                            name={
                              sub.kind === "similar_events"
                                ? "calendar-outline"
                                : "storefront-outline"
                            }
                            size={18}
                            tone="muted"
                          />
                        </View>
                      )}
                      <View className="flex-1">
                        <AppText
                          variant="body"
                          numberOfLines={1}
                          onPress={
                            sub.kind === "organizer" && sub.targetSlug
                              ? () =>
                                  router.push(`/(app)/user/${sub.targetSlug}`)
                              : sub.kind === "place" && sub.targetId
                                ? () =>
                                    router.push(`/(app)/place/${sub.targetId}`)
                                : undefined
                          }
                        >
                          {sub.label}
                        </AppText>
                        <AppText variant="caption" tone="muted">
                          {KIND_LABEL[sub.kind]}
                          {sub.status === "paused" ? " · paused" : ""}
                        </AppText>
                      </View>
                      <Button
                        title="Stop"
                        size="sm"
                        variant="outline"
                        disabled={stop.isPending && stop.variables === sub.id}
                        onPress={() => stop.mutate(sub.id)}
                      />
                    </View>
                  ))
                )}
              </Card>
            ) : null}

            <Card className="gap-0">
              <AppText variant="cardTitle" className="pb-1">
                Messages and activity
              </AppText>
              <Row
                title="Messages, reviews and bookings"
                description="Push for new messages, reviews, replies and booking updates. You'll still see them in Notifications."
                value={p.socialPush}
                disabled={save.isPending}
                onChange={(v) => save.mutate({ socialPush: v })}
              />
            </Card>

            <Card className="gap-0">
              <AppText variant="cardTitle" className="pb-1">
                Email
              </AppText>
              <Row
                title="Email me when credit is ready"
                description={
                  p.email
                    ? `To ${p.email}. At most one email every 12 hours.`
                    : "Your account has no email address, so you'll get these in the app only."
                }
                value={p.rewardEmails && !!p.email}
                disabled={save.isPending || !p.email}
                onChange={(v) => save.mutate({ rewardEmails: v })}
              />
            </Card>

            <Card className="flex-row gap-3 bg-muted">
              <Icon name="lock-closed-outline" size={18} tone="muted" />
              <View className="flex-1 gap-0.5">
                <AppText variant="bodyStrong">Always on</AppText>
                <AppText variant="small" tone="muted">
                  Tickets, payments, refunds, event cancellations, account
                  security and verification decisions. These are part of the
                  service, so they can't be turned off here.
                </AppText>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
