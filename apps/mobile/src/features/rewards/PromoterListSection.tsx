import { api } from "@/lib/api";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { EventPromoterCommission } from "@abonten/types/rewards";
import {
  AppText,
  Avatar,
  Button,
  Field,
  Input,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";

const pct = (bps: number) => Number((bps / 100).toFixed(2));

type Saved = {
  status: number;
  message?: string;
  data?: EventPromoterCommission;
};

// Invited promoters on one event (X33, X36), the native echo of the web
// PromoterListSection: the people the organizer adds, each with their own
// rate if they like, and the switch that lets only them earn. A member of
// the team running the event earns only when an Owner added them; the
// server enforces it and the list says so.
export function PromoterListSection({
  eventId,
  offer,
  onSaved,
}: {
  eventId: string;
  offer: EventPromoterCommission;
  onSaved: (data: EventPromoterCommission) => void;
}) {
  const { locale } = useLocale();
  const t = useTranslations("rewards");
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [rate, setRate] = useState("");

  const settle = (res: Saved, success: string) => {
    if (res.status === 200 && res.data) {
      onSaved(res.data);
      toast.success(success);
      return true;
    }
    toast.error(t("couldnTSaveTheCommission"), {
      description: res.message ?? t("pleaseTryAgain"),
    });
    return false;
  };
  const failed = () =>
    toast.error(t("couldnTSaveTheCommission"), {
      description: t("pleaseTryAgain"),
    });

  const toggle = useMutation({
    mutationFn: (invitedOnly: boolean) =>
      api.organizer.setEventPromoterCommission(
        eventId,
        offer.rateBps,
        invitedOnly,
      ),
    onSuccess: (res, invitedOnly) =>
      settle(
        res,
        t(invitedOnly ? "invitedOnlySavedOn" : "invitedOnlySavedOff"),
      ),
    onError: failed,
  });

  const typed = Number(rate.replace(",", "."));
  const typedBps = Math.round(typed * 100);
  const rateValid =
    rate.trim() === "" ||
    (Number.isFinite(typed) &&
      typedBps >= offer.minRateBps &&
      typedBps <= offer.maxRateBps);

  const add = useMutation({
    mutationFn: () =>
      api.organizer.addEventPromoter(eventId, {
        username: username.trim(),
        rateBps: rate.trim() === "" ? null : typedBps,
      }),
    onSuccess: (res) => {
      if (settle(res, t("promoterSavedToast"))) {
        setUsername("");
        setRate("");
      }
    },
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: (p: { userId: string; name: string }) =>
      api.organizer.removeEventPromoter(eventId, p.userId),
    onSuccess: (res, p) =>
      settle(res, t("promoterRemovedToast", { name: p.name })),
    onError: failed,
  });

  const confirmRemove = (userId: string, name: string) =>
    Alert.alert(t("removePromoterTitle", { name }), t("removePromoterBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("removePromoter"),
        style: "destructive",
        onPress: () => remove.mutate({ userId, name }),
      },
    ]);

  const busy = toggle.isPending || add.isPending || remove.isPending;
  const full = offer.promoters.length >= offer.maxPromoters;

  return (
    <View className="gap-3 border-t border-border pt-3">
      <AppText variant="bodyStrong">{t("promotersTitle")}</AppText>
      <AppText variant="small" tone="muted">
        {t("promotersHint")}
      </AppText>

      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <AppText variant="small" className="font-semibold">
            {t("invitedOnlyLabel")}
          </AppText>
          <AppText variant="meta">{t("invitedOnlyHint")}</AppText>
        </View>
        <Switch
          value={offer.invitedOnly}
          onValueChange={(value) => toggle.mutate(value)}
          disabled={busy}
          accessibilityLabel={t("invitedOnlyLabel")}
        />
      </View>
      {offer.invitedOnly && offer.promoters.length === 0 ? (
        <AppText variant="small" tone="warning">
          {t("invitedOnlyEmpty")}
        </AppText>
      ) : null}

      {offer.promoters.length > 0 ? (
        <View className="gap-3">
          {offer.promoters.map((p) => (
            <View key={p.userId} className="flex-row items-center gap-3">
              <Avatar
                publicId={p.avatarPublicId}
                version={p.avatarVersion}
                size={36}
              />
              <View className="flex-1 gap-0.5">
                <AppText
                  variant="small"
                  className="font-semibold"
                  numberOfLines={1}
                >
                  {p.name}
                  {p.username ? ` @${p.username}` : ""}
                </AppText>
                <AppText variant="meta">
                  {p.rateBps !== null
                    ? t("promoterOwnRate", { pct: pct(p.rateBps) })
                    : t("promoterEventRate")}
                  {p.teamMember ? ` · ${t("promoterTeamMember")}` : ""}
                </AppText>
                {p.teamMember && !p.approved ? (
                  <AppText variant="meta" tone="warning">
                    {t("promoterNeedsOwner")}
                  </AppText>
                ) : null}
                <AppText variant="meta" className="tabular-nums">
                  {t("promoterFigures", {
                    sales: p.sales,
                    pending: formatCredit(
                      p.pendingMinor,
                      offer.currency,
                      locale,
                    ),
                    paid: formatCredit(p.paidMinor, offer.currency, locale),
                  })}
                </AppText>
              </View>
              <Button
                title={t("removePromoter")}
                variant="outline"
                size="sm"
                disabled={busy}
                onPress={() => confirmRemove(p.userId, p.name)}
              />
            </View>
          ))}
        </View>
      ) : (
        <AppText variant="small" tone="muted">
          {t("noPromotersYet")}
        </AppText>
      )}

      {full ? (
        <AppText variant="small" tone="muted">
          {t("promotersFull", { max: offer.maxPromoters })}
        </AppText>
      ) : (
        <View className="gap-2">
          <Field label={t("promoterUsernameLabel")}>
            <Input
              value={username}
              onChangeText={setUsername}
              placeholder={t("promoterUsernamePlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("promoterUsernameLabel")}
            />
          </Field>
          <Field
            label={t("promoterRateLabel", {
              min: pct(offer.minRateBps),
              max: pct(offer.maxRateBps),
            })}
          >
            <Input
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder={
                offer.rateBps !== null ? String(pct(offer.rateBps)) : ""
              }
              accessibilityLabel={t("promoterRateLabel", {
                min: pct(offer.minRateBps),
                max: pct(offer.maxRateBps),
              })}
            />
          </Field>
          <Button
            title={t("addPromoter")}
            disabled={busy || username.trim() === "" || !rateValid}
            loading={add.isPending}
            onPress={() => add.mutate()}
          />
        </View>
      )}
    </View>
  );
}
