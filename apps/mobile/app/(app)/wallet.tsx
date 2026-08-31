import {
  useAddMomoWallet,
  useMomoNetworks,
  usePaymentMethods,
  useRemovePaymentMethod,
  useSetDefaultPaymentMethod,
} from "@/features/wallet/usePaymentMethods";
import type { PaymentMethodRow } from "@abonten/api-client";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

const GH_PHONE = /^(0[0-9]{9}|\+233[0-9]{9})$/;

function methodTitle(m: PaymentMethodRow): string {
  const d = m.details as Record<string, string>;
  if (m.method_type === "momo") {
    return `${d.networkName ?? "Mobile money"} · ${d.phone ?? ""}`;
  }
  return `${d.brand ?? "Card"} ···· ${d.last4 ?? ""}`;
}

export default function WalletScreen() {
  const { data, isLoading, isError, refetch } = usePaymentMethods();
  const networks = useMomoNetworks();
  const addMomo = useAddMomoWallet();
  const removeMethod = useRemovePaymentMethod();
  const setDefault = useSetDefaultPaymentMethod();

  const [showForm, setShowForm] = useState(false);
  const [networkCode, setNetworkCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");

  const methods = data?.status === 200 ? (data.data ?? []) : [];
  const networkList =
    networks.data?.status === 200 ? (networks.data.data ?? []) : [];

  async function onAdd() {
    const net = networkList.find((n) => n.code === networkCode);
    if (!net) {
      Alert.alert("Pick a network");
      return;
    }
    if (!GH_PHONE.test(phone.trim())) {
      Alert.alert("Enter a valid Ghana phone number (024XXXXXXX or +233…)");
      return;
    }
    const res = await addMomo.mutateAsync({
      networkCode: net.code,
      networkName: net.name,
      phone: phone.trim(),
    });
    if (res.status === 200) {
      setShowForm(false);
      setPhone("");
      setNetworkCode(null);
      return;
    }
    Alert.alert("Couldn't add wallet", res.message ?? "Please try again.");
  }

  function confirmRemove(id: string) {
    Alert.alert("Remove this payment method?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await removeMethod.mutateAsync(id);
          if (res.status !== 200) {
            Alert.alert("Couldn't remove", res.message ?? "Please try again.");
          }
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-muted-foreground">
          Couldn't load your payment methods.
        </Text>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => refetch()}
        >
          <Text className="font-semibold text-primary-foreground">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 p-4 pb-10"
    >
      {methods.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No saved payment methods yet.
        </Text>
      ) : (
        methods.map((m) => (
          <View
            key={m.id}
            className="gap-2 rounded-xl border border-border bg-card p-4"
          >
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-sm font-medium text-foreground">
                {methodTitle(m)}
              </Text>
              {m.is_default ? (
                <View className="rounded-full bg-accent px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase text-accent-foreground">
                    Default
                  </Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row gap-4">
              {!m.is_default ? (
                <Pressable
                  onPress={() => setDefault.mutate(m.id)}
                  disabled={setDefault.isPending}
                >
                  <Text className="text-xs font-semibold text-primary">
                    Make default
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => confirmRemove(m.id)}
                disabled={removeMethod.isPending}
              >
                <Text className="text-xs font-semibold text-destructive">
                  Remove
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {showForm ? (
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-sm font-semibold text-foreground">
            Add mobile money
          </Text>

          <View className="flex-row flex-wrap gap-2">
            {networkList.map((n) => {
              const selected = n.code === networkCode;
              return (
                <Pressable
                  key={n.code}
                  onPress={() => setNetworkCode(n.code)}
                  className={`rounded-full border px-3 py-1.5 ${
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-background"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      selected ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {n.name}
                  </Text>
                </Pressable>
              );
            })}
            {networks.isLoading ? <ActivityIndicator /> : null}
          </View>

          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="024XXXXXXX"
            keyboardType="phone-pad"
            autoCapitalize="none"
            className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            placeholderTextColor="#999"
          />

          <View className="flex-row gap-2">
            <Pressable
              onPress={onAdd}
              disabled={addMomo.isPending}
              className="flex-1 items-center rounded-lg bg-primary px-4 py-2.5"
            >
              {addMomo.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-primary-foreground">
                  Save
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setShowForm(false)}
              className="items-center rounded-lg border border-border px-4 py-2.5"
            >
              <Text className="text-sm text-foreground">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowForm(true)}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3"
        >
          <Ionicons name="add" size={18} color="#888" />
          <Text className="text-sm font-semibold text-foreground">
            Add mobile money
          </Text>
        </Pressable>
      )}

      <Text className="text-[11px] text-muted-foreground">
        Cards can't be added from the app yet — add one on the website.
      </Text>
    </ScrollView>
  );
}
