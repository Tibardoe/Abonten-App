import { formatTicketCodeForReading } from "@abonten/core/ticketTransfers/ticketCode";
import { AppText, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { Pressable, View } from "react-native";

/**
 * The ticket's code, hidden until the holder taps "Show code" (decision
 * X16): a screenshot of the ticket no longer gives it away. The QR still
 * scans; the code is for reading out at a help desk.
 */
export function TicketCodeRow({ code }: { code: string | null }) {
  const t = useTranslations("tickets");
  const [shown, setShown] = useState(false);
  if (!code) return null;
  return (
    <View className="flex-row gap-3">
      <Icon
        name="barcode-outline"
        size={18}
        tone="muted"
        style={{ marginTop: 2 }}
      />
      <View className="flex-1 gap-0.5">
        <AppText variant="body">{t("ticketReference")}</AppText>
        {shown ? (
          <>
            <AppText variant="metaStrong" className="tracking-[2px]">
              {formatTicketCodeForReading(code)}
            </AppText>
            <AppText variant="caption" tone="muted">
              {t("keepCodePrivate")}
            </AppText>
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: shown }}
          hitSlop={8}
          onPress={() => setShown((v) => !v)}
        >
          <AppText variant="small" tone="primary" className="font-semibold">
            {shown ? t("hideCode") : t("showCode")}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
