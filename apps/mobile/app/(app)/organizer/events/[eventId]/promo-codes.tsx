import {
  useDeletePromoCode,
  useEventPromoCodes,
  useUpdatePromoCode,
} from "@/features/organizer/useEventPromoCodes";
import { combineDateAndTime, hhmm, isoDate } from "@/lib/datetime";
import type { EventPromoCode } from "@abonten/api-client";
import { AppText, Button, Field, Input } from "@abonten/ui-native";
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
      Alert.alert(
        "Check the discount",
        "Enter a percentage between 1 and 100.",
      );
      return;
    }
    const maxUses = s.maxUses.trim() === "" ? null : Number(s.maxUses);
    if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      Alert.alert(
        "Check the usage cap",
        "Leave it blank for unlimited, or enter a whole number.",
      );
      return;
    }
    const expiry = combineDateAndTime(s.expiryDate, s.expiryTime);
    if (!expiry) {
      Alert.alert(
        "Check the expiry",
        "Enter the date as YYYY-MM-DD and the time as HH:MM.",
      );
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
            Alert.alert("Couldn't update", res.message);
          }
        },
        onError: () =>
          Alert.alert("Couldn't update", "Please try again in a moment."),
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
                  Alert.alert(
                    res.deactivatedOnly ? "Deactivated" : "Deleted",
                    res.message,
                  );
                } else {
                  Alert.alert("Couldn't delete", res.message);
                }
              },
              onError: () =>
                Alert.alert("Couldn't delete", "Please try again in a moment."),
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

  const result = q.data;
  const codes = result && result.status === 200 ? result.data : [];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4 pb-16"
    >
      <AppText className="text-xl font-bold text-foreground">
        Promo codes
      </AppText>

      {q.isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator />
        </View>
      ) : q.isError || (result && result.status !== 200) ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {(result && result.status === 403 && result.message) ||
              "Couldn't load this event's promo codes."}
          </AppText>
          <Pressable
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <AppText className="font-semibold text-primary-foreground">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : codes.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          This event has no promo codes. Add them when you create an event.
        </AppText>
      ) : (
        codes.map((code) => (
          <PromoCodeCard key={code.id} code={code} eventId={id} />
        ))
      )}
    </ScrollView>
  );
}
