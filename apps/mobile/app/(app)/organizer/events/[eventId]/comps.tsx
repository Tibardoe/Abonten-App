import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import {
  AppText,
  Button,
  Chip,
  Field,
  Input,
  KeyboardAwareScrollView,
  SegmentedTabs,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

type Mode = "username" | "phone";

// Free tickets (docs/architecture/complimentary-tickets.md): give real
// tickets of one of the event's types to a named person — cast, press,
// sponsors, family. They come out of the seats, are seated and checked in
// like any other, and are never refundable. Mirrors the website's
// Manage › Attendees card; POST /api/mobile/organizer/events/:id/complimentary.
export default function GiveComplimentaryScreen() {
  const t = useTranslations("events");
  const tt = useTranslations("tickets");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";

  const { data: event } = useQuery({
    queryKey: ["mobile", "organizer", "event-comps", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event")
        .select(
          "id, timezone, status, event_occurrence(id, starts_at, ends_at), ticket_type(id, type, admits, quantity)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const types = event?.ticket_type ?? [];
  const occurrences = [...(event?.event_occurrence ?? [])]
    .filter((o) => new Date(o.ends_at).getTime() > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const [typeId, setTypeId] = useState<string | null>(null);
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [mode, setMode] = useState<Mode>("username");
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");

  const chosenType = typeId ?? types[0]?.id ?? null;
  const chosenDate = occurrenceId ?? occurrences[0]?.id ?? null;

  const give = useMutation({
    mutationFn: () =>
      api.organizer.giveComplimentaryTickets(id, {
        ticketTypeId: chosenType as string,
        quantity: Number(quantity),
        occurrenceId: occurrences.length > 0 ? chosenDate : null,
        target:
          mode === "username"
            ? { kind: "username", username: who.trim().replace(/^@/, "") }
            : { kind: "phone", phone: who.trim() },
        note: note.trim() || null,
      }),
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success(res.message ?? t("giveTickets"));
        setWho("");
        setNote("");
        setQuantity("1");
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
      } else {
        toast.error(res.message ?? t("couldNotGiveTickets"));
      }
    },
    onError: () => toast.error(t("couldNotGiveTickets")),
  });

  const ready =
    !!chosenType && !!who.trim() && Number(quantity) >= 1 && !give.isPending;

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
    >
      <Stack.Screen options={{ title: t("giveFreeTickets") }} />
      <View className="gap-1">
        <AppText variant="screenTitle">{t("giveFreeTickets")}</AppText>
        <AppText variant="meta">{t("giveFreeTicketsIntro")}</AppText>
      </View>

      {event && event.status !== "published" ? (
        <AppText variant="small" tone="muted">
          {t("giveTicketsNeedsPublished")}
        </AppText>
      ) : null}

      <View className="gap-3">
        <SegmentedTabs
          options={[
            { key: "username", label: tt("sendByUsername") },
            { key: "phone", label: tt("sendByPhone") },
          ]}
          value={mode}
          onChange={(next: Mode) => setMode(next)}
        />
        <Input
          value={who}
          onChangeText={setWho}
          placeholder={
            mode === "username"
              ? tt("usernamePlaceholder")
              : tt("phonePlaceholder")
          }
          accessibilityLabel={
            mode === "username" ? tt("sendByUsername") : tt("sendByPhone")
          }
          keyboardType={mode === "phone" ? "phone-pad" : "default"}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Field label={t("ticketType")}>
          <View className="flex-row flex-wrap gap-2">
            {types.map((type) => (
              <Chip
                key={type.id}
                label={ticketTypeLabel(tc, type.type)}
                selected={chosenType === type.id}
                onPress={() => setTypeId(type.id)}
              />
            ))}
          </View>
        </Field>

        {occurrences.length > 0 ? (
          <Field label={t("forDate")}>
            <View className="flex-row flex-wrap gap-2">
              {occurrences.map((o) => (
                <Chip
                  key={o.id}
                  label={formatInTimeZone(
                    o.starts_at,
                    event?.timezone ?? "Africa/Accra",
                    {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                    locale,
                  )}
                  selected={chosenDate === o.id}
                  onPress={() => setOccurrenceId(o.id)}
                />
              ))}
            </View>
          </Field>
        ) : null}

        <Field label={t("howMany")}>
          <Input
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
        </Field>

        <Field label={t("noteOptional")}>
          <Input
            value={note}
            onChangeText={setNote}
            maxLength={200}
            placeholder={t("compNotePlaceholder")}
          />
        </Field>

        <Button
          title={t("giveTickets")}
          fullWidth
          loading={give.isPending}
          disabled={!ready || event?.status !== "published"}
          onPress={() => give.mutate()}
        />
      </View>
    </KeyboardAwareScrollView>
  );
}
