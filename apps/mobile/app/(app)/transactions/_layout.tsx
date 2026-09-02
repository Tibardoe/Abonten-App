import { AppHeader } from "@/components/app/AppHeader";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

// Transactions is a small nested stack inside the (app) stack — the list
// plus a per-transaction detail screen, the native echo of the web
// /transactions and /transactions/[kind]/[id] routes. Shares the standard
// secondary-screen <AppHeader> via the layout so neither screen wires one.
export default function TransactionsLayout() {
  const c = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        contentStyle: { backgroundColor: c.background },
        header: ({ options }) => (
          <AppHeader
            variant="title"
            title={typeof options.title === "string" ? options.title : ""}
            backFallback="/(app)/account"
          />
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "Transactions" }} />
      <Stack.Screen name="[kind]/[id]" options={{ title: "Transaction" }} />
    </Stack>
  );
}
