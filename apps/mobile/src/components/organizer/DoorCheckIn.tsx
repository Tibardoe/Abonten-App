import { TicketScannerSheet } from "@/components/organizer/TicketScannerSheet";
import { useCheckInTicket } from "@/features/organizer/useAttendees";
import { AppText, Button, Input } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { ScrollView, View } from "react-native";

/**
 * Door staff (a team role that covers scanning, not the attendee list):
 * scan a ticket or type the code under its QR. They see whether it worked,
 * never who is coming. Only this event's tickets are accepted.
 */
export function DoorCheckIn({ eventId }: { eventId: string }) {
  const t = useTranslations("teams");
  const tm = useTranslations("manage");
  const checkIn = useCheckInTicket(eventId);
  const [code, setCode] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const submit = () => {
    const value = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!value || checkIn.isPending) return;
    checkIn.mutate(
      { ticketId: value, checkedIn: true },
      {
        onSuccess: (res) => {
          const ok = res.status === 200;
          setResult({
            ok,
            text: ok ? t("checkedIn") : (res.message ?? t("couldNotDo")),
          });
          if (ok) setCode("");
        },
        onError: () => setResult({ ok: false, text: t("couldNotDo") }),
      },
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        {/* The screen's header already says "Check people in". */}
        <AppText variant="muted">{t("checkInBody")}</AppText>

        <Button
          title={tm("scanTickets")}
          leftIcon="qr-code-outline"
          onPress={() => setScanOpen(true)}
        />

        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <AppText variant="label">{t("ticketCodeLabel")}</AppText>
          <Input
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setResult(null);
            }}
            placeholder={t("codePlaceholder")}
            accessibilityLabel={t("ticketCodeLabel")}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Button
            title={t("checkIn")}
            variant="secondary"
            disabled={!code.trim() || checkIn.isPending}
            loading={checkIn.isPending}
            onPress={submit}
          />
          {result ? (
            <AppText
              accessibilityLiveRegion="polite"
              variant="bodyStrong"
              tone={result.ok ? "success" : "error"}
            >
              {result.text}
            </AppText>
          ) : null}
        </View>
      </ScrollView>

      <TicketScannerSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        eventId={eventId}
      />
    </View>
  );
}
