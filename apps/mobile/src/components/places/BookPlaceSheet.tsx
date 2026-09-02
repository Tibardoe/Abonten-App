import { TimeField, prettyTime } from "@/components/datetime/TimeField";
import { DateRangeField } from "@/components/explore/DateRangeField";
import { useRequestBooking } from "@/features/places/usePlaceBooking";
import {
  AppText,
  Button,
  Chip,
  Field,
  Icon,
  Input,
  Sheet,
} from "@abonten/ui-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

type BookingService = { id: string; name: string };

// Native echo of the web RequestBookingModal. Reservation REQUEST only — no
// payment. Optional service, a single future date + time, optional party
// size + note. The place-detail screen only mounts this when the place has
// at least one service (confirmed platform choice — web shows Book on any
// place).
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
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(0);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, [open]);

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
      setError("Please pick a date and time.");
      return;
    }
    if (requestedTime.getTime() <= Date.now()) {
      setError("Please pick a time in the future.");
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
            setError(res.message ?? "Couldn't send your request.");
          }
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Something went wrong."),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Book ${placeName}`}
      footer={
        submitted ? (
          <Button title="Done" onPress={onClose} />
        ) : (
          <Button
            title={request.isPending ? "Sending…" : "Request booking"}
            onPress={onSubmit}
            disabled={request.isPending}
          />
        )
      }
    >
      {submitted ? (
        <View className="items-center gap-3 py-4">
          <Icon name="checkmark-circle" size={44} tone="success" />
          <AppText variant="bodyStrong" className="text-center">
            Booking request sent
          </AppText>
          <AppText variant="muted" className="text-center">
            The owner will accept or decline it. You can track it under My
            bookings.
          </AppText>
        </View>
      ) : (
        <View className="gap-4">
          <AppText variant="muted">
            This is a request only — payment, if any, is arranged directly with
            the owner.
          </AppText>

          {services.length > 0 ? (
            <View className="gap-2">
              <AppText variant="label">Service</AppText>
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  label="No specific service"
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
            <AppText variant="label">Date</AppText>
            <DateRangeField
              start={date}
              end={null}
              mode="single"
              onChange={(next) => setDate(next.start)}
            />
          </View>

          <View className="gap-2">
            <AppText variant="label">Time</AppText>
            <TimeField
              value={time}
              onChange={setTime}
              label="Booking time"
              invalid={!!error && !time}
            />
            {requestedTime ? (
              <AppText variant="caption">
                Requesting {requestedTime.toLocaleDateString()} at{" "}
                {prettyTime(time)}
              </AppText>
            ) : null}
          </View>

          <View className="gap-2">
            <AppText variant="label">Party size (optional)</AppText>
            <View className="flex-row items-center gap-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer guests"
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
                accessibilityLabel="More guests"
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

          <Field label="Note for the owner (optional)">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="Anything the owner should know"
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
