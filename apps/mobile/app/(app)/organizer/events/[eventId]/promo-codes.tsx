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
import { FREE_TICKET_TYPE } from "@abonten/core/ticketTiers";
import {
  AppText,
  Button,
  Field,
  Input,
  Refresher,
  useToast,
} from "@abonten/ui-native";
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
      toast.error("Check the discount", {
        description: "Enter a percentage between 1 and 100.",
      });
      return;
    }
    const maxUses = s.maxUses.trim() === "" ? null : Number(s.maxUses);
    if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      toast.error("Check the usage cap", {
        description: "Leave it blank for unlimited, or enter a whole number.",
      });
      return;
    }
    const expiry = combineDateAndTime(s.expiryDate, s.expiryTime);
    if (!expiry) {
      toast.error("Check the expiry", {
        description: "Enter the date as YYYY-MM-DD and the time as HH:MM.",
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
            toast.error("Couldn't update", { description: res.message });
          }
        },
        onError: () =>
          toast.error("Couldn't update", {
            description: "Please try again in a moment.",
          }),
      },
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete this promo code?",
      "If it has already been used it will be deactivated instead, so redemption history is kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            del.mutate(code.id, {
              onSuccess: (res) => {
                if (res.status === 200) {
                  toast.success(
                    res.deactivatedOnly
                      ? "Promo code deactivated"
                      : "Promo code deleted",
                    { description: res.message },
                  );
                } else {
                  toast.error("Couldn't delete", { description: res.message });
                }
              },
              onError: () =>
                toast.error("Couldn't delete", {
                  description: "Please try again in a moment.",
                }),
            }),
        },
      ],
    );
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <AppText className="font-bold text-foreground">
            {code.promoCode}
          </AppText>
          <AppText className="text-xs text-muted-foreground">
            {code.timesUsed} use{code.timesUsed === 1 ? "" : "s"}
            {code.maxUses != null ? ` of ${code.maxUses} max` : " (unlimited)"}
          </AppText>
        </View>
        <AppText
          className={
            code.isActive
              ? "shrink-0 text-xs font-semibold text-primary"
              : "shrink-0 text-xs font-semibold text-muted-foreground"
          }
        >
          {code.isActive ? "Active" : "Inactive"}
        </AppText>
      </View>

      {editing ? (
        <View className="gap-3 pt-1">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label="Discount %">
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
              <Field label="Max uses" hint="Blank = unlimited">
                <Input
                  keyboardType="number-pad"
                  value={s.maxUses}
                  onChangeText={(v) => setS((p) => ({ ...p, maxUses: v }))}
                  placeholder="Unlimited"
                />
              </Field>
            </View>
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label="Expiry date">
                <Input
                  autoCapitalize="none"
                  value={s.expiryDate}
                  onChangeText={(v) => setS((p) => ({ ...p, expiryDate: v }))}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </View>
            <View className="w-28">
              <Field label="Time">
                <Input
                  value={s.expiryTime}
                  onChangeText={(v) => setS((p) => ({ ...p, expiryTime: v }))}
                  placeholder="23:59"
                />
              </Field>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <AppText className="text-sm text-foreground">Active</AppText>
            <Switch
              value={s.isActive}
              onValueChange={(v) => setS((p) => ({ ...p, isActive: v }))}
            />
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title={update.isPending ? "Saving…" : "Save"}
                onPress={save}
                loading={update.isPending}
                disabled={update.isPending}
              />
            </View>
            <View className="flex-1">
              <Button
                title="Cancel"
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
                Discount
              </AppText>
              <AppText className="text-sm text-foreground">
                {code.discountPercentage ?? 0}%
              </AppText>
            </View>
            <View className="flex-row justify-between">
              <AppText className="text-sm text-muted-foreground">
                Expires
              </AppText>
              <AppText className="text-sm text-foreground">
                {code.expiresAt
                  ? new Date(code.expiresAt).toLocaleString()
                  : "Never"}
              </AppText>
            </View>
          </View>

          <View className="flex-row gap-2 pt-1">
            <View className="flex-1">
              <Button title="Edit" variant="outline" onPress={beginEdit} />
            </View>
            <View className="flex-1">
              <Button
                title="Delete"
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
      <AppText variant="screenTitle">Promo codes</AppText>

      {forbidden ? (
        <AppText className="text-center text-muted-foreground">
          {result.message || "You're not authorized to manage this event."}
        </AppText>
      ) : view.kind !== "content" && view.kind !== "empty" ? (
        <QueryUnavailable
          view={view}
          subject="this event's promo codes"
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
            ? "Promo codes aren't available on a free event. Make the event paid to offer discount codes."
            : "This event has no promo codes. Add them when you create an event."}
        </AppText>
      ) : (
        <>
          {isFree ? (
            <AppText className="text-sm text-muted-foreground">
              This event is free, so its promo codes can&apos;t be active. They
              stay here for their history.
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
