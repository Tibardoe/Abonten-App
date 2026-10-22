import { formatDateTime } from "@abonten/core/i18n/format";
import {
  CHECK_IN_MAX_MINUTES,
  CHECK_IN_MIN_MINUTES,
  CHECK_IN_PRESET_MINUTES,
  SAFETY_NOTE_MAX,
  SHARE_PRESET_HOURS,
} from "@abonten/core/safety/rules";
import type {
  SafetyContact,
  SafetyEventContext,
} from "@abonten/types/safetyType";
import { AppText, Button, Chip, Field, Input, Sheet } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

// "Check in on me" and "Share my location": how long, an optional note,
// and (for a share) who sees it. The sheet says plainly what will happen —
// nobody is told about a check-in unless the person misses it.

export type StartSessionRequest =
  | { kind: "check_in"; minutes: number; note?: string }
  | {
      kind: "share";
      hours?: number;
      untilEventEnds?: boolean;
      contactIds?: string[];
      note?: string;
    };

const MINUTE = 60_000;

export function StartSessionSheet({
  mode,
  open,
  onClose,
  contacts,
  event,
  timezone,
  graceMinutes,
  shareMaxHours,
  busy,
  onStart,
}: {
  mode: "check_in" | "share";
  open: boolean;
  onClose: () => void;
  contacts: SafetyContact[];
  event: SafetyEventContext | null;
  timezone: string;
  graceMinutes: number;
  shareMaxHours: number;
  busy: boolean;
  onStart: (request: StartSessionRequest) => void;
}) {
  const t = useTranslations("safety");
  const { locale } = useLocale();
  const reachable = useMemo(
    () => contacts.filter((c) => c.status !== "declined"),
    [contacts],
  );
  const eventEnds = event?.endsAt ? Date.parse(event.endsAt) : null;
  const eventEndsUsable =
    eventEnds !== null &&
    eventEnds - Date.now() > CHECK_IN_MIN_MINUTES * MINUTE;

  const [minutes, setMinutes] = useState<number>(CHECK_IN_PRESET_MINUTES[1]);
  const [untilEvent, setUntilEvent] = useState(false);
  const [hours, setHours] = useState<number>(SHARE_PRESET_HOURS[1]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setUntilEvent(false);
    setNote("");
    setChosen(new Set(reachable.map((c) => c.id)));
  }, [open, reachable]);

  const clock = (at: number) =>
    formatDateTime(at, locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

  const checkInMinutes =
    untilEvent && eventEnds !== null
      ? Math.min(
          CHECK_IN_MAX_MINUTES,
          Math.max(
            CHECK_IN_MIN_MINUTES,
            Math.round((eventEnds - Date.now()) / MINUTE),
          ),
        )
      : minutes;
  const dueAt = Date.now() + checkInMinutes * MINUTE;
  const shareEndsAt =
    untilEvent && eventEnds !== null
      ? eventEnds
      : Date.now() + hours * 60 * MINUTE;

  const start = () => {
    const trimmed = note.trim() || undefined;
    if (mode === "check_in") {
      onStart({ kind: "check_in", minutes: checkInMinutes, note: trimmed });
      return;
    }
    const all = chosen.size === reachable.length;
    onStart({
      kind: "share",
      ...(untilEvent ? { untilEventEnds: true } : { hours }),
      contactIds: all ? undefined : [...chosen],
      note: trimmed,
    });
  };

  const durationLabel = (m: number) =>
    m < 60
      ? t("minutesShort", { minutes: m })
      : t("hoursShort", { hours: m / 60 });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "check_in" ? t("checkInTitle") : t("shareTitle")}
      footer={
        <Button
          title={mode === "check_in" ? t("startCheckIn") : t("startSharing")}
          loading={busy}
          loadingTitle={t("starting")}
          disabled={busy || (mode === "share" && chosen.size === 0)}
          fullWidth
          onPress={start}
        />
      }
    >
      <View className="gap-5 pb-2">
        <AppText variant="small">
          {mode === "check_in" ? t("checkInExplain") : t("shareExplain")}
        </AppText>

        <View className="gap-2">
          <AppText variant="label">
            {mode === "check_in" ? t("checkInWhen") : t("shareHowLong")}
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {mode === "check_in"
              ? CHECK_IN_PRESET_MINUTES.map((m) => (
                  <Chip
                    key={m}
                    label={t("inDuration", { duration: durationLabel(m) })}
                    selected={!untilEvent && minutes === m}
                    onPress={() => {
                      setUntilEvent(false);
                      setMinutes(m);
                    }}
                  />
                ))
              : SHARE_PRESET_HOURS.filter((h) => h <= shareMaxHours).map(
                  (h) => (
                    <Chip
                      key={h}
                      label={t("hoursShort", { hours: h })}
                      selected={!untilEvent && hours === h}
                      onPress={() => {
                        setUntilEvent(false);
                        setHours(h);
                      }}
                    />
                  ),
                )}
            {eventEndsUsable && event ? (
              <Chip
                label={t("whenEventEnds", { event: event.title })}
                selected={untilEvent}
                onPress={() => setUntilEvent(true)}
              />
            ) : null}
          </View>
          {mode === "check_in" && !untilEvent ? (
            <View className="flex-row gap-2">
              <Button
                title={t("minus15")}
                variant="outline"
                size="sm"
                disabled={minutes - 15 < CHECK_IN_MIN_MINUTES}
                onPress={() =>
                  setMinutes((m) => Math.max(CHECK_IN_MIN_MINUTES, m - 15))
                }
              />
              <Button
                title={t("plus15")}
                variant="outline"
                size="sm"
                disabled={minutes + 15 > CHECK_IN_MAX_MINUTES}
                onPress={() =>
                  setMinutes((m) => Math.min(CHECK_IN_MAX_MINUTES, m + 15))
                }
              />
            </View>
          ) : null}
          <AppText variant="meta">
            {mode === "check_in"
              ? t("checkInPreview", {
                  time: clock(dueAt),
                  alertTime: clock(dueAt + graceMinutes * MINUTE),
                  count: reachable.length,
                })
              : t("sharePreview", { time: clock(shareEndsAt) })}
          </AppText>
        </View>

        {mode === "share" ? (
          <View className="gap-2">
            <AppText variant="label">{t("whoSees")}</AppText>
            <View className="flex-row flex-wrap gap-2">
              {reachable.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  showCheck
                  selected={chosen.has(c.id)}
                  onPress={() =>
                    setChosen((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        <Field label={t("noteLabel")} hint={t("noteHint")}>
          <Input
            value={note}
            onChangeText={setNote}
            maxLength={SAFETY_NOTE_MAX}
            multiline
            placeholder={
              mode === "check_in"
                ? t("checkInNotePlaceholder")
                : t("notePlaceholder")
            }
          />
        </Field>
      </View>
    </Sheet>
  );
}
