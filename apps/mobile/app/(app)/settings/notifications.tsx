import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  useNotificationPreferences,
  useStopSubscription,
  useSubscriptions,
  useUpdateNotificationPreferences,
} from "@/features/alerts/useAlerts";
import { useDiscoveryProgram } from "@/features/discovery/useDiscoveryProgram";
import { useQueryView } from "@/lib/useQueryView";
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
import { Linking, Pressable, ScrollView, Switch, View } from "react-native";

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
  organizer: "newEvents",
  place: "updatesFromThisPlace",
  similar_events: "similarEvents",
  similar_places: "similarPlaces",
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
  // Loading, offline and failed are told apart from the settings and from
  // "you don't follow anyone yet" (only ever said for a server answer).
  const prefsView = useQueryView(prefs);
  const subsView = useQueryView(subs, (list) => list.length === 0);
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
            onRefresh={() => Promise.all([prefs.refetch(), subs.refetch()])}
          />
        }
      >
        {osPushOff ? (
          <Card className="flex-row items-center gap-3">
            <Icon name="notifications-off-outline" size={20} tone="warning" />
            <AppText variant="small" className="flex-1">
              {t("notificationsAreTurnedOffForAbonten")}
            </AppText>
            <Button
              title={t("openSettings")}
              size="sm"
              variant="outline"
              onPress={() => Linking.openSettings()}
            />
          </Card>
        ) : null}

        {!p ? (
          <QueryUnavailable
            view={prefsView}
            subject={t("yourSettings")}
            onRetry={() => prefs.refetch()}
            loading={
              <View className="gap-3">
                {["a", "b", "c"].map((k) => (
                  <Skeleton key={k} width="100%" height={96} radius={16} />
                ))}
              </View>
            }
          />
        ) : (
          <>
            {showFollowing ? (
              <Card className="gap-0">
                <AppText variant="cardTitle" className="pb-1">
                  {t("alertsAndPicks")}
                </AppText>
                <Row
                  title={t("newEventsFromOrganizersYouFollow")}
                  description={t("whenSomeoneYouTappedNotifyMe")}
                  value={p.organizerAlertsPush}
                  disabled={save.isPending}
                  onChange={(v) => save.mutate({ organizerAlertsPush: v })}
                />
                <Row
                  title={t("updatesFromPlacesYouFollow")}
                  description={t("newEventsAtPlacesYouAsked")}
                  value={p.placeUpdatesPush}
                  disabled={save.isPending}
                  onChange={(v) => save.mutate({ placeUpdatesPush: v })}
                />
                <Row
                  title={t("similarEventsAndPlaces")}
                  description={t("picksLikeTheOnesYouEnjoy")}
                  value={p.recommendationsPush}
                  disabled={save.isPending}
                  onChange={(v) => save.mutate({ recommendationsPush: v })}
                />
                <View className="gap-2 py-3">
                  <AppText variant="bodyStrong">{t("takeABreak")}</AppText>
                  <AppText variant="small" tone="muted">
                    {pausedUntil
                      ? t("alertsAndPicksArePausedUntil2", {
                          toLocaleDateString: pausedUntil.toLocaleDateString(
                            undefined,
                            { day: "numeric", month: "short" },
                          ),
                        })
                      : t("pauseAlertsAndPicksForTwo")}
                  </AppText>
                  <Button
                    title={pausedUntil ? t("resumeNow") : t("pauseFor2Weeks")}
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
                <AppText variant="cardTitle">{t("whatYouFollow")}</AppText>
                {subsView.kind === "loading" ? (
                  <Skeleton width="100%" height={44} />
                ) : subsView.kind === "offline" || subsView.kind === "error" ? (
                  <AppText variant="small" tone="muted">
                    {subsView.kind === "offline"
                      ? t("youReOfflineWhatYouFollow")
                      : t("couldnTLoadWhatYouFollow")}
                  </AppText>
                ) : followed.length === 0 ? (
                  <AppText variant="small" tone="muted">
                    {t("youDonTFollowAnyoneYet2")}
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
                          {t(KIND_LABEL[sub.kind])}
                          {sub.status === "paused" ? t("paused") : ""}
                        </AppText>
                      </View>
                      <Button
                        title={t("stop")}
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
                {t("messagesAndActivity")}
              </AppText>
              <Row
                title={t("messagesReviewsAndBookings")}
                description={t("pushForNewMessagesReviewsReplies")}
                value={p.socialPush}
                disabled={save.isPending}
                onChange={(v) => save.mutate({ socialPush: v })}
              />
            </Card>

            <Card className="gap-0">
              <AppText variant="cardTitle" className="pb-1">
                {t("email")}
              </AppText>
              <Row
                title={t("emailMeWhenCreditIsReady")}
                description={
                  p.email
                    ? t("toAtMostOneEmailEvery", { email: p.email })
                    : t("yourAccountHasNoEmailAddress")
                }
                value={p.rewardEmails && !!p.email}
                disabled={save.isPending || !p.email}
                onChange={(v) => save.mutate({ rewardEmails: v })}
              />
              {!p.email ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/(app)/settings/account-setup")}
                  className="self-start py-2 active:opacity-60"
                >
                  <AppText
                    variant="small"
                    tone="brand"
                    className="font-semibold"
                  >
                    {t("addAnEmailAddress")}
                  </AppText>
                </Pressable>
              ) : null}
              {program.recommendationEmail || p.recommendationEmails ? (
                <Row
                  title={t("emailMePicksAndAlerts")}
                  description={
                    p.email
                      ? t("theSamePicksAsThePush", { email: p.email })
                      : t("yourAccountHasNoEmailAddress2")
                  }
                  value={p.recommendationEmails && !!p.email}
                  disabled={
                    save.isPending ||
                    (!p.recommendationEmails &&
                      (!p.email || !program.recommendationEmail))
                  }
                  onChange={(v) => save.mutate({ recommendationEmails: v })}
                />
              ) : null}
            </Card>

            <Card className="flex-row gap-3 bg-muted">
              <Icon name="lock-closed-outline" size={18} tone="muted" />
              <View className="flex-1 gap-0.5">
                <AppText variant="bodyStrong">{t("alwaysOn")}</AppText>
                <AppText variant="small" tone="muted">
                  {t("ticketsPaymentsRefundsEventCancellationsAccount2")}
                </AppText>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
