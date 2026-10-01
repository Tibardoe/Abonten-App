import { RecommendationPromptCard } from "@/components/alerts/RecommendationPromptCard";
import type { FreeRsvpFlow } from "@/features/checkout/useFreeRsvpFlow";
import type { EventDetail } from "@/features/discovery/useEventDetail";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { AppText, Button } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// Native echo of the web AttendingButton's RSVP path. One free ticket per
// event, quantity fixed at 1 server-side. The state lives in the screen's
// useFreeRsvpFlow, shared with the sticky "Reserve spot" button.
export function FreeRsvpCard({
  event,
  flow,
  showAction = true,
}: {
  event: EventDetail;
  flow: FreeRsvpFlow;
  /** False when the screen's sticky bar carries the RSVP button. */
  showAction?: boolean;
}) {
  const { locale } = useLocale();

  const t = useTranslations("checkout");

  const router = useRouter();
  const {
    now,
    occurrences,
    occurrenceId,
    isOccurrenceSelectable,
    done,
    justRsvped,
  } = flow;
  const setPickedOccurrenceId = flow.pick;

  if (done) {
    return (
      <View className="gap-3">
        <View className="items-center gap-2 rounded-xl border border-border bg-card p-5">
          <AppText className="text-base font-bold text-success">
            {t("youReGoing")}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/tickets")}
            className="rounded-lg bg-primary px-4 py-2.5"
          >
            <AppText className="text-sm font-semibold text-primary-foreground">
              {t("viewMyTicket")}
            </AppText>
          </Pressable>
        </View>
        {justRsvped ? (
          <RecommendationPromptCard
            context={{ context: "rsvp", eventId: event.id }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View className="gap-3">
      {occurrences.length > 1 ? (
        <View className="gap-2">
          <AppText className="text-sm font-semibold text-foreground">
            {t("date")}
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {occurrences.map((o) => {
              const selectable = isOccurrenceSelectable(o);
              const selected = selectable && o.id === occurrenceId;
              const inProgress =
                !selectable && new Date(o.ends_at).getTime() > now;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={o.id}
                  disabled={!selectable}
                  onPress={() => setPickedOccurrenceId(o.id)}
                  className={`rounded-full border px-3 py-1.5 ${
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  } ${selectable ? "" : "opacity-40"}`}
                >
                  <AppText
                    className={`text-[13px] ${
                      selected ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {formatDateWithSuffix(o.starts_at, undefined, locale)}
                    {selectable
                      ? ""
                      : inProgress
                        ? t("inProgress2")
                        : t("past2")}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <AppText variant="caption">{t("thisEventIsFreeOneTicket")}</AppText>

      {showAction ? (
        <Button
          title={flow.pending ? t("reserving") : t("rsvpGetFreeTicket")}
          loading={flow.pending}
          onPress={flow.submit}
        />
      ) : null}
    </View>
  );
}
