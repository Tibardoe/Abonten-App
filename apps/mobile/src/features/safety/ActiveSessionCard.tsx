import { getRelativeTime } from "@abonten/core/dateFormatter";
import { formatDateTime } from "@abonten/core/i18n/format";
import { primaryEmergencyNumber } from "@abonten/core/safety/emergencyNumbers";
import {
  CHECK_IN_EXTEND_MINUTES,
  SAFETY_NOTE_MAX,
} from "@abonten/core/safety/rules";
import type {
  SafetyEmergencyNumber,
  SafetyRecipientState,
  SafetySession,
} from "@abonten/types/safetyType";
import { AppText, Button, Card, Field, Icon, Input } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { View } from "react-native";
import { SosHoldButton } from "./SosHoldButton";

// The open session at the top of the Safety screen: what is happening, who
// was told and what they answered, and what the person can do next. During
// an alert the emergency number and "text them from my phone" come first;
// "I'm safe" is last, so it is not the button a shaking thumb lands on.

export type ActiveSessionActions = {
  onSos: () => void;
  onResolve: (resolution: "safe" | "false_alarm" | "ended") => void;
  onExtend: (minutes: number) => void;
  onSaveNote: (note: string) => Promise<boolean>;
  onTellEventTeam: () => void;
  onTextFromPhone: () => void;
  onCall: (number: string) => void;
  onTurnOnLocation: () => void;
};

function RecipientLine({ r, now }: { r: SafetyRecipientState; now: number }) {
  const t = useTranslations("safety");
  const { locale } = useLocale();
  let state: string;
  let tone: "success" | "warning" | "muted" | "error" = "muted";
  if (r.acknowledgement === "on_my_way") {
    state = t("recipient.onMyWay");
    tone = "success";
  } else if (r.acknowledgement === "calling") {
    state = t("recipient.calling");
    tone = "success";
  } else if (r.acknowledgement === "cant_help") {
    state = t("recipient.cantHelp");
    tone = "warning";
  } else if (r.viewedAt) {
    state = t("recipient.opened", {
      when: getRelativeTime(r.viewedAt, new Date(now), locale),
    });
    tone = "success";
  } else if (r.delivery === "sent") {
    state = t("recipient.told");
  } else if (r.delivery === "pending" || r.delivery === "sending") {
    state = t("recipient.sending");
  } else if (r.delivery === "failed") {
    state = t("recipient.failed");
    tone = "error";
  } else {
    state = t("recipient.notTexted");
    tone = "warning";
  }
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5">
      <View className="flex-1 flex-row items-center gap-2">
        <Icon
          name={r.kind === "event_team" ? "people-outline" : "person-outline"}
          size={16}
          tone="muted"
        />
        <AppText variant="bodyStrong" numberOfLines={1} className="flex-1">
          {r.kind === "event_team" ? t("eventTeam") : r.name}
        </AppText>
      </View>
      <AppText variant="meta" tone={tone}>
        {state}
      </AppText>
    </View>
  );
}

export function ActiveSessionCard({
  session,
  emergencyNumbers,
  timezone,
  locationAllowed,
  busy,
  actions,
}: {
  session: SafetySession;
  emergencyNumbers: SafetyEmergencyNumber[];
  timezone: string;
  locationAllowed: boolean;
  busy: boolean;
  actions: ActiveSessionActions;
}) {
  const t = useTranslations("safety");
  const { locale } = useLocale();
  const [note, setNote] = useState(session.note ?? "");
  const [editingNote, setEditingNote] = useState(false);
  const now = Date.now();
  const alerting = session.status === "alerting";
  const emergency = primaryEmergencyNumber(emergencyNumbers);
  const clock = (at: string) =>
    formatDateTime(at, locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

  const title = alerting
    ? session.alertReason === "check_in_missed"
      ? t("active.missedTitle")
      : t("active.alertTitle")
    : session.kind === "check_in" && session.dueAt
      ? t("active.checkInTitle", { time: clock(session.dueAt) })
      : t("active.shareTitle", { time: clock(session.endsAt) });

  const located = session.lastLocation
    ? t("active.locationSent", {
        when: getRelativeTime(session.lastLocation.at, new Date(now), locale),
      })
    : locationAllowed
      ? t("active.locationWaiting")
      : t("active.locationOff");

  return (
    <Card
      className={`gap-4 ${alerting ? "border-destructive" : ""}`}
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row items-start gap-3">
        <Icon
          name={
            alerting
              ? "alert-circle"
              : session.kind === "share"
                ? "navigate-circle-outline"
                : "time-outline"
          }
          size={28}
          tone={alerting ? "destructive" : "primary"}
        />
        <View className="flex-1 gap-1">
          <AppText variant="cardTitle">{title}</AppText>
          {session.event ? (
            <AppText variant="meta">
              {t("active.atEvent", { event: session.event.title })}
            </AppText>
          ) : null}
          <AppText
            variant="meta"
            tone={!session.lastLocation && !locationAllowed ? "error" : "muted"}
          >
            {located}
          </AppText>
        </View>
      </View>

      {!locationAllowed ? (
        <Button
          title={t("turnOnLocation")}
          variant="outline"
          leftIcon="location-outline"
          onPress={actions.onTurnOnLocation}
        />
      ) : null}

      {session.recipients.length > 0 ? (
        <View>
          {session.recipients.map((r) => (
            <RecipientLine key={r.id} r={r} now={now} />
          ))}
        </View>
      ) : session.kind === "check_in" ? (
        <AppText variant="small">{t("active.checkInQuiet")}</AppText>
      ) : null}

      {alerting && emergency ? (
        <Button
          title={t("callEmergency", { number: emergency.number })}
          variant="destructive"
          size="lg"
          leftIcon="call"
          fullWidth
          onPress={() => actions.onCall(emergency.number)}
        />
      ) : null}

      {alerting || session.kind === "share" ? (
        <Button
          title={
            session.textFromPhone.length > 0
              ? t("textThemFromPhone", { count: session.textFromPhone.length })
              : t("textFromPhoneToo")
          }
          variant={session.textFromPhone.length > 0 ? "primary" : "outline"}
          leftIcon="chatbubble-ellipses-outline"
          fullWidth
          onPress={actions.onTextFromPhone}
        />
      ) : null}

      {session.canTellEventTeam ? (
        <Button
          title={t("tellEventTeam")}
          variant="outline"
          leftIcon="megaphone-outline"
          fullWidth
          disabled={busy}
          onPress={actions.onTellEventTeam}
        />
      ) : session.eventTeamNotifiedAt ? (
        <AppText variant="small">{t("eventTeamTold")}</AppText>
      ) : null}

      {editingNote ? (
        <View className="gap-2">
          <Field label={t("noteLabel")} hint={t("noteHint")}>
            <Input
              value={note}
              onChangeText={setNote}
              maxLength={SAFETY_NOTE_MAX}
              multiline
              placeholder={t("notePlaceholder")}
            />
          </Field>
          <View className="flex-row gap-2">
            <Button
              title={t("saveNote")}
              size="sm"
              disabled={busy}
              onPress={async () => {
                if (await actions.onSaveNote(note)) setEditingNote(false);
              }}
            />
            <Button
              title={t("cancel")}
              size="sm"
              variant="ghost"
              onPress={() => {
                setNote(session.note ?? "");
                setEditingNote(false);
              }}
            />
          </View>
        </View>
      ) : (
        <Button
          title={session.note ? t("editNote") : t("addNote")}
          variant="ghost"
          size="sm"
          leftIcon="create-outline"
          onPress={() => setEditingNote(true)}
        />
      )}

      {session.kind === "check_in" && session.status === "active" ? (
        <View className="gap-3">
          <Button
            title={t("imSafe")}
            size="lg"
            leftIcon="checkmark-circle-outline"
            fullWidth
            disabled={busy}
            onPress={() => actions.onResolve("safe")}
          />
          <View className="flex-row flex-wrap gap-2">
            {CHECK_IN_EXTEND_MINUTES.map((m) => (
              <Button
                key={m}
                title={t("extendBy", { minutes: m })}
                variant="outline"
                size="sm"
                disabled={busy}
                onPress={() => actions.onExtend(m)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!alerting ? (
        <View className="items-center gap-2 pt-2">
          <SosHoldButton onTrigger={actions.onSos} disabled={busy} size={132} />
          <AppText variant="caption" className="text-center">
            {t("sosDuringSession")}
          </AppText>
        </View>
      ) : null}

      {session.kind === "share" && !alerting ? (
        <Button
          title={t("stopSharing")}
          variant="outline"
          disabled={busy}
          onPress={() => actions.onResolve("ended")}
        />
      ) : null}

      {alerting ? (
        <View className="gap-2 border-t border-border pt-4">
          <Button
            title={t("imSafe")}
            leftIcon="checkmark-circle-outline"
            fullWidth
            disabled={busy}
            onPress={() => actions.onResolve("safe")}
          />
          <Button
            title={t("itWasAMistake")}
            variant="ghost"
            fullWidth
            disabled={busy}
            onPress={() => actions.onResolve("false_alarm")}
          />
        </View>
      ) : null}
    </Card>
  );
}
