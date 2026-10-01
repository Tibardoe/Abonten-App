import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  useDeletePromoCode,
  useEventPromoCodes,
  useUpdatePromoCode,
} from "@/features/organizer/useEventPromoCodes";
import { api } from "@/lib/api";
import { combineDateAndTime, hhmm, isoDate } from "@/lib/datetime";
import { settleEnvelope } from "@/lib/envelope";
import { useQueryView } from "@/lib/useQueryView";
import type { EventPromoCode } from "@abonten/api-client";
import { formatDateTime } from "@abonten/core/i18n/format";
import { FREE_TICKET_TYPE } from "@abonten/core/ticketTiers";
import {
  AppText,
  Button,
  Field,
  Input,
  Refresher,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";

type EditState = {
  discountPercentage: string;
  maxUses: string;
  expiryDate: string;
  expiryTime: string;
  isActive: boolean;
};

function startState(code: EventPromoCode): EditState {
  const d = code.expiresAt ? new Date(code.expiresAt) : null;
  return {
    discountPercentage: String(code.discountPercentage ?? 0),
    maxUses: code.maxUses != null ? String(code.maxUses) : "",
    expiryDate: d ? isoDate(d) : "",
    expiryTime: d ? hhmm(d) : "23:59",
    isActive: code.isActive,
  };
}

function PromoCodeCard({
  code,
  eventId,
}: {
  code: EventPromoCode;
  eventId: string;
}) {
  const { locale } = useLocale();
  const t = useTranslations("manage");

  const toast = useToast();
  const update = useUpdatePromoCode(eventId);
  const del = useDeletePromoCode(eventId);
  const [editing, setEditing] = useState(false);
  const [s, setS] = useState<EditState>(() => startState(code));

  const beginEdit = () => {
    setS(startState(code));
    setEditing(true);
  };

  const save = () => {
    const discount = Number(s.discountPercentage);
    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) {
      toast.error(t("checkTheDiscount"), {
        description: t("enterAPercentageBetween1And"),
      });
      return;
    }
    const maxUses = s.maxUses.trim() === "" ? null : Number(s.maxUses);
    if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      toast.error(t("checkTheUsageCap"), {
        description: t("leaveItBlankForUnlimitedOr"),
      });
      return;
    }
    const expiry = combineDateAndTime(s.expiryDate, s.expiryTime);
    if (!expiry) {
      toast.error(t("checkTheExpiry"), {
        description: t("enterTheDateAsYyyyMm"),
      });
      return;
    }
    update.mutate(
      {
        promoCodeId: code.id,
        discountPercentage: discount,
        maxUses,
        expiresAt: expiry.toISOString(),
        isActive: s.isActive,
      },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            setEditing(false);
          } else {
            toast.error(t("couldnTUpdate"), { description: res.message });
          }
        },
        onError: () =>
          toast.error(t("couldnTUpdate"), {
            description: t("pleaseTryAgainInAMoment"),
          }),
      },
    );
  };

  const confirmDelete = () => {
    Alert.alert(t("deleteThisPromoCode"), t("ifItHasAlreadyBeenUsed"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deleteText"),
        style: "destructive",
        onPress: () =>
          del.mutate(code.id, {
            onSuccess: (res) => {
              if (res.status === 200) {
                toast.success(
                  res.deactivatedOnly
                    ? t("promoCodeDeactivated")
                    : t("promoCodeDeleted"),
                  { description: res.message },
                );
              } else {
                toast.error(t("couldnTDelete"), { description: res.message });
              }
            },
            onError: () =>
              toast.error(t("couldnTDelete"), {
                description: t("pleaseTryAgainInAMoment"),
              }),
          }),
      },
    ]);
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <AppText className="font-bold text-foreground">
            {code.promoCode}
          </AppText>
          <AppText className="text-xs text-muted-foreground">
            {t("use", { timesUsed: code.timesUsed })}
            {code.maxUses != null
              ? t("ofMax", { maxUses: code.maxUses })
              : t("unlimited2")}
          </AppText>
        </View>
        <AppText
          className={
            code.isActive
              ? "shrink-0 text-xs font-semibold text-primary"
              : "shrink-0 text-xs font-semibold text-muted-foreground"
          }
        >
          {code.isActive ? t("active") : t("inactive")}
        </AppText>
      </View>

      {editing ? (
        <View className="gap-3 pt-1">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label={t("discount2")}>
                <Input
                  keyboardType="number-pad"
                  value={s.discountPercentage}
                  onChangeText={(v) =>
                    setS((p) => ({ ...p, discountPercentage: v }))
                  }
                  placeholder="10"
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label={t("maxUses")} hint={t("blankUnlimited")}>
                <Input
                  keyboardType="number-pad"
                  value={s.maxUses}
                  onChangeText={(v) => setS((p) => ({ ...p, maxUses: v }))}
                  placeholder={t("unlimited")}
                />
              </Field>
            </View>
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label={t("expiryDate")}>
                <Input
                  autoCapitalize="none"
                  value={s.expiryDate}
                  onChangeText={(v) => setS((p) => ({ ...p, expiryDate: v }))}
                  placeholder={t("yyyyMmDd")}
                />
              </Field>
            </View>
            <View className="w-28">
              <Field label={t("time")}>
                <Input
                  value={s.expiryTime}
                  onChangeText={(v) => setS((p) => ({ ...p, expiryTime: v }))}
                  placeholder="23:59"
                />
              </Field>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <AppText className="text-sm text-foreground">{t("active")}</AppText>
            <Switch
              value={s.isActive}
              onValueChange={(v) => setS((p) => ({ ...p, isActive: v }))}
            />
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title={update.isPending ? t("saving") : t("save")}
                onPress={save}
                loading={update.isPending}
                disabled={update.isPending}
              />
            </View>
            <View className="flex-1">
              <Button
                title={t("cancel")}
                variant="outline"
                onPress={() => setEditing(false)}
                disabled={update.isPending}
              />
            </View>
          </View>
        </View>
      ) : (
        <>
          <View className="gap-1 pt-1">
            <View className="flex-row justify-between">
              <AppText className="text-sm text-muted-foreground">
                {t("discount3")}
              </AppText>
              <AppText className="text-sm text-foreground">
                {code.discountPercentage ?? 0}%
              </AppText>
            </View>
            <View className="flex-row justify-between">
              <AppText className="text-sm text-muted-foreground">
                {t("expires")}
              </AppText>
              <AppText className="text-sm text-foreground">
                {code.expiresAt
                  ? formatDateTime(code.expiresAt, locale)
                  : t("never")}
              </AppText>
            </View>
          </View>

          <View className="flex-row gap-2 pt-1">
            <View className="flex-1">
              <Button title={t("edit")} variant="outline" onPress={beginEdit} />
            </View>
            <View className="flex-1">
              <Button
                title={t("deleteText")}
                variant="destructive"
                onPress={confirmDelete}
                loading={del.isPending}
                disabled={del.isPending}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export default function EventPromoCodesScreen() {
  const t = useTranslations("manage");

  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";
  const q = useEventPromoCodes(id);
  // Same query the edit screen holds, so a free event (FREE tier) can say
  // codes are unavailable instead of "add them when you create an event".
  const context = useQuery({
    queryKey: ["mobile", "organizer", "event-edit", id],
    queryFn: async () =>
      settleEnvelope(await api.organizer.eventEditContext(id)),
    enabled: !!id,
  });
  const isFree =
    context.data?.status === 200 &&
    (context.data.data.event.ticket_type ?? []).some(
      (t) => t.type === FREE_TICKET_TYPE,
    );

  const result = q.data;
  const codes = result && result.status === 200 ? result.data : [];
  // The server's own answer that this event is not this person's: shown
  // as such, never as a load failure.
  const forbidden = result?.status === 403;
  // "No promo codes" is only ever said for an answer the server gave;
  // loading, offline and failed are told apart.
  const view = useQueryView(q, () => codes.length === 0);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4 pb-16"
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
    >
      <AppText variant="screenTitle">{t("promoCodes")}</AppText>

      {forbidden ? (
        <AppText className="text-center text-muted-foreground">
          {result.message || t("youReNotAuthorizedToManage")}
        </AppText>
      ) : view.kind !== "content" && view.kind !== "empty" ? (
        <QueryUnavailable
          view={view}
          subject={t("thisEventSPromoCodes")}
          onRetry={() => q.refetch()}
          loading={
            <View className="items-center py-12">
              <ActivityIndicator />
            </View>
          }
        />
      ) : codes.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          {isFree
            ? t("promoCodesArenTAvailableOn")
            : t("thisEventHasNoPromoCodes")}
        </AppText>
      ) : (
        <>
          {isFree ? (
            <AppText className="text-sm text-muted-foreground">
              {t("thisEventIsFreeSoIts")}
            </AppText>
          ) : null}
          {codes.map((code) => (
            <PromoCodeCard key={code.id} code={code} eventId={id} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
