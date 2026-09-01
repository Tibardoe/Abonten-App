import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

// Transactions is a small stack inside the (app) tab group — the list plus a
// per-transaction detail screen, the native echo of the web /transactions
// and /transactions/[kind]/[id] routes.
export default function TransactionsLayout() {
  const c = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.sidebar },
        headerTitleStyle: { color: c.foreground },
        headerTintColor: c.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Transactions" }} />
      <Stack.Screen name="[kind]/[id]" options={{ title: "Transaction" }} />
    </Stack>
  );
}
