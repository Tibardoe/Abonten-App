import { TimeField, prettyTime } from "@/components/datetime/TimeField";
import { DateRangeField } from "@/components/explore/DateRangeField";
import { useRequestBooking } from "@/features/places/usePlaceBooking";
import { formatDate } from "@abonten/core/i18n/format";
import {
  AppText,
  Button,
  Chip,
  Field,
  Icon,
  Input,
  Sheet,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

type BookingService = { id: string; name: string };

// Native echo of the web RequestBookingModal. Reservation REQUEST only — no
// payment. Optional service, a single future date + time, optional party
// size + note. Offered on any place (matching web); the service picker
// below only renders when the place actually lists services.
export function BookPlaceSheet({
  open,
  onClose,
  placeId,
  placeName,
  services,
}: {
  open: boolean;
  onClose: () => void;
  placeId: string;
  placeName: string;
  services: BookingService[];
}) {
  const { locale } = useLocale();
  const t = useTranslations("places");

  const hasServices = services.length > 0;

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(0);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // With no services listed, ask before dropping the user into the form.
  const [step, setStep] = useState<"confirm" | "form">(
    hasServices ? "form" : "confirm",
  );
  const request = useRequestBooking(placeId);

  useEffect(() => {
    if (!open) return;
    setServiceId(null);
    setDate(null);
    setTime(null);
    setPartySize(0);
    setNote("");
    setSubmitted(false);
    setError(null);
    setStep(hasServices ? "form" : "confirm");
  }, [open, hasServices]);

  const requestedTime = useMemo(() => {
    if (!date || !time) return null;
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }, [date, time]);

  function onSubmit() {
    setError(null);
    if (!requestedTime) {
      setError(t("pleasePickADateAndTime"));
      return;
    }
    if (requestedTime.getTime() <= Date.now()) {
      setError(t("pleasePickATimeInThe"));
      return;
    }
    request.mutate(
      {
        serviceId: serviceId,
        requestedTime: requestedTime.toISOString(),
        partySize: partySize > 0 ? partySize : null,
        note: note.trim() || null,
      },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            setSubmitted(true);
          } else {
            setError(res.message ?? t("couldnTSendYourRequest"));
          }
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : t("somethingWentWrong2")),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("book2", { placeName: placeName })}
      footer={
        submitted ? (
          <Button title={t("done")} onPress={onClose} />
        ) : step === "confirm" ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title={t("cancel")} variant="outline" onPress={onClose} />
            </View>
            <View className="flex-1">
              <Button
                title={t("continueText")}
                onPress={() => setStep("form")}
              />
            </View>
          </View>
        ) : (
          <Button
            title={request.isPending ? t("sending2") : t("requestBooking2")}
            onPress={onSubmit}
            disabled={request.isPending}
          />
        )
      }
    >
      {step === "confirm" && !submitted ? (
        <View className="gap-3 py-2">
          <AppText variant="bodyStrong">
            {t("noServicesAvailableForBooking")}
          </AppText>
          <AppText variant="muted">
            {t("thisPlaceCurrentlyHasNoServices")}
          </AppText>
        </View>
      ) : submitted ? (
        <View className="items-center gap-3 py-4">
          <Icon name="checkmark-circle" size={44} tone="success" />
          <AppText variant="bodyStrong" className="text-center">
            {t("bookingRequestSent")}
          </AppText>
          <AppText variant="muted" className="text-center">
            {t("theOwnerWillAcceptOrDecline")}
          </AppText>
        </View>
      ) : (
        <View className="gap-4">
          <AppText variant="muted">{t("thisIsARequestOnlyPayment2")}</AppText>

          {services.length > 0 ? (
            <View className="gap-2">
              <AppText variant="label">{t("service2")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  label={t("noSpecificService")}
                  selected={serviceId === null}
                  onPress={() => setServiceId(null)}
                />
                {services.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={serviceId === s.id}
                    onPress={() => setServiceId(s.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View className="gap-2">
            <AppText variant="label">{t("date")}</AppText>
            <DateRangeField
              start={date}
              end={null}
              mode="single"
              onChange={(next) => setDate(next.start)}
            />
          </View>

          <View className="gap-2">
            <AppText variant="label">{t("time")}</AppText>
            <TimeField
              value={time}
              onChange={setTime}
              label={t("bookingTime")}
              invalid={!!error && !time}
            />
            {requestedTime ? (
              <AppText variant="caption">
                {t("requestingAt", {
                  date: formatDate(requestedTime, locale),
                  prettyTime: prettyTime(time),
                })}
              </AppText>
            ) : null}
          </View>

          <View className="gap-2">
            <AppText variant="label">{t("partySizeOptional")}</AppText>
            <View className="flex-row items-center gap-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("fewerGuests")}
                disabled={partySize <= 0}
                onPress={() => setPartySize((n) => Math.max(0, n - 1))}
                hitSlop={6}
                className={`h-9 w-9 items-center justify-center rounded-full border ${
                  partySize <= 0 ? "border-border opacity-40" : "border-primary"
                }`}
              >
                <Icon
                  name="remove"
                  size={18}
                  tone={partySize <= 0 ? "muted" : "primary"}
                />
              </Pressable>
              <AppText variant="body" className="w-8 text-center font-semibold">
                {partySize > 0 ? partySize : "—"}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("moreGuests")}
                disabled={partySize >= 50}
                onPress={() => setPartySize((n) => Math.min(50, n + 1))}
                hitSlop={6}
                className={`h-9 w-9 items-center justify-center rounded-full border ${
                  partySize >= 50
                    ? "border-border opacity-40"
                    : "border-primary"
                }`}
              >
                <Icon
                  name="add"
                  size={18}
                  tone={partySize >= 50 ? "muted" : "primary"}
                />
              </Pressable>
            </View>
          </View>

          <Field label={t("noteForTheOwnerOptional")}>
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={t("anythingTheOwnerShouldKnow")}
              multiline
              numberOfLines={3}
              maxLength={500}
              style={{ minHeight: 72, textAlignVertical: "top" }}
            />
          </Field>

          {error ? (
            <AppText variant="small" tone="error">
              {error}
            </AppText>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
