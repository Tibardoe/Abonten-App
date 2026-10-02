import { usePromptOffer, usePromptResponse } from "@/features/alerts/useAlerts";
import { api } from "@/lib/api";
import { eventCategoryLabel } from "@abonten/core/categoryLabels";
import type { PromptContext } from "@abonten/types/discoveryType";
import { AppText, Button, Card, Icon, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, View } from "react-native";

// The explicit opt-in after a ticket, an RSVP or a place interaction:
// "Enjoy events like this?" / "Like this place?". It sits below the success
// message and never blocks it, "Not now" always works, nothing is subscribed
// until "Turn on notifications" is pressed, and the server decides whether
// it may appear at all (programme on, not already subscribed, not dismissed
// recently, at most one prompt a week).

export function RecommendationPromptCard({
  context,
  onClose,
}: {
  context: PromptContext;
  onClose?: () => void;
}) {
  const t = useTranslations("notifications");
  const tc = useTranslations("core");

  const toast = useToast();
  const router = useRouter();
  const { data: offer } = usePromptOffer(context);
  const respond = usePromptResponse();
  const [alsoOrganizer, setAlsoOrganizer] = useState(false);
  const [done, setDone] = useState<null | "accepted" | "dismissed">(null);
  const recorded = useRef(false);

  const empty =
    !offer || (!offer.similarEvents && !offer.organizer && !offer.place);

  useEffect(() => {
    if (!empty && !recorded.current) {
      recorded.current = true;
      api.alerts.promptShown(context).catch(() => {});
    }
  }, [empty, context]);

  if (empty || done === "dismissed") return null;

  const send = (response: "accepted" | "dismissed") =>
    respond.mutate(
      {
        context,
        response,
        accept:
          response === "accepted"
            ? { similarEvents: true, organizer: alsoOrganizer, place: true }
            : undefined,
      },
      {
        onSuccess: (res) => {
          if (res.status !== 200) {
            toast.error(t("couldnTSaveThat"), {
              description: res.message ?? t("pleaseTryAgain"),
            });
            return;
          }
          setDone(response);
          if (response === "dismissed") onClose?.();
        },
        onError: () =>
          toast.error(t("couldnTSaveThat"), {
            description: t("pleaseTryAgain"),
          }),
      },
    );

  if (done === "accepted") {
    return (
      <Card className="gap-1" accessibilityLiveRegion="polite">
        <AppText variant="bodyStrong">{t("notificationsOn")}</AppText>
        <AppText variant="small" tone="muted">
          {t("weLlOnlySendWhatYou")}
        </AppText>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/(app)/settings/notifications")}
        >
          <AppText variant="small" tone="brand" className="font-medium">
            {t("manageNotifications")}
          </AppText>
        </Pressable>
      </Card>
    );
  }

  const place = offer?.place;
  const similar = offer?.similarEvents;
  const organizer = offer?.organizer;
  const title = place ? t("likeThisPlace") : t("enjoyEventsLikeThis");
  const body = place
    ? t("getUpdatesFromAndDiscoverSimilar", { name: place.name })
    : similar?.locality
      ? t("getNotifiedWhenSimilarEventsAre", {
          category: eventCategoryLabel(tc, similar.category ?? ""),
          locality: similar.locality,
        })
      : t("getNotifiedWhenSimilarEventsAreNearYou", {
          category: eventCategoryLabel(tc, similar?.category ?? ""),
        });

  return (
    <Card className="gap-3">
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Icon name="notifications-outline" size={20} tone="primary" />
        </View>
        <View className="flex-1 gap-1">
          <AppText variant="cardTitle">{title}</AppText>
          <AppText variant="small" tone="muted">
            {body}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("dismiss")}
          hitSlop={10}
          disabled={respond.isPending}
          onPress={() => send("dismissed")}
        >
          <Icon name="close" size={18} tone="muted" />
        </Pressable>
      </View>
      {organizer && !place ? (
        <View className="flex-row items-center justify-between gap-3">
          <AppText variant="small" className="flex-1">
            {t("alsoTellMeWhenPostsA", { username: organizer.username })}
          </AppText>
          <Switch
            accessibilityLabel={t("alsoAlertMeWhenPosts", {
              username: organizer.username,
            })}
            value={alsoOrganizer}
            onValueChange={setAlsoOrganizer}
          />
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          title={t("turnOnNotifications")}
          className="flex-1"
          loading={
            respond.isPending && respond.variables?.response === "accepted"
          }
          disabled={respond.isPending}
          onPress={() => send("accepted")}
        />
        <Button
          title={t("notNow")}
          variant="outline"
          disabled={respond.isPending}
          onPress={() => send("dismissed")}
        />
      </View>
    </Card>
  );
}
