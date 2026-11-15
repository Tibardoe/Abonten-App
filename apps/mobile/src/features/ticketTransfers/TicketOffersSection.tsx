import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateTime } from "@abonten/core/i18n/format";
import { personName } from "@abonten/core/personName";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type { IncomingTicketTransfer } from "@abonten/types/ticketTransferType";
import { AppText, Avatar, Button, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import {
  useAnswerTicketTransfer,
  useTicketTransfers,
} from "./useTicketTransfers";

/**
 * "Tickets sent to you", at the top of My Tickets: each offer waiting for
 * the person, with Accept and Decline. Nothing when there is none.
 * Answering works even while the programme is switched off.
 */
export function TicketOffersSection() {
  const t = useTranslations("tickets");
  const { data } = useTicketTransfers();
  const offers = data?.status === 200 ? (data.data?.incoming ?? []) : [];
  if (offers.length === 0) return null;

  return (
    <View className="mb-1 gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <AppText variant="sectionHeading" accessibilityRole="header">
        {t("offersTitle")}
      </AppText>
      {offers.map((offer) => (
        <OfferRow key={offer.id} offer={offer} />
      ))}
      <AppText variant="caption" tone="muted">
        {t("onlyAcceptSent")}
      </AppText>
    </View>
  );
}

function OfferRow({ offer }: { offer: IncomingTicketTransfer }) {
  const t = useTranslations("tickets");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const answer = useAnswerTicketTransfer();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const from =
    personName(tc, {
      full_name: offer.from.name,
      username: offer.from.username,
    }) ?? "";

  const respond = async (action: "accept" | "decline") => {
    setBusy(action);
    try {
      const res = await answer.mutateAsync({ transferId: offer.id, action });
      if (res.status === 200) {
        toast.success(
          action === "accept" ? t("acceptedToast") : t("declinedToast"),
        );
      } else {
        toast.error(res.message ?? t("couldNotAnswer"));
      }
    } catch {
      toast.error(t("couldNotAnswer"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="flex-row gap-3 rounded-xl border border-border bg-card p-3">
      <Image
        source={{
          uri: buildCloudinaryUrl(
            offer.event.flyerPublicId,
            offer.event.flyerVersion,
            { width: 128, height: 128 },
          ),
        }}
        style={{ width: 64, height: 64, borderRadius: 8 }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Avatar
            publicId={offer.from.avatarPublicId}
            version={offer.from.avatarVersion}
            size={20}
          />
          <AppText variant="small" numberOfLines={1} className="flex-1">
            {t("offerFrom", { name: from })}
          </AppText>
        </View>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {offer.event.title}
        </AppText>
        {offer.ticketType ? (
          <AppText variant="meta">
            {ticketTypeLabel(tc, offer.ticketType)}
          </AppText>
        ) : null}
        <AppText variant="meta">
          {t("acceptBefore", {
            date: formatDateTime(offer.expiresAt, locale),
          })}
        </AppText>
        <View className="mt-1 flex-row gap-2">
          <Button
            title={busy === "accept" ? t("accepting") : t("acceptTicket")}
            size="sm"
            disabled={busy !== null}
            loading={busy === "accept"}
            onPress={() => respond("accept")}
          />
          <Button
            title={t("declineTicket")}
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onPress={() => respond("decline")}
          />
        </View>
      </View>
    </View>
  );
}
