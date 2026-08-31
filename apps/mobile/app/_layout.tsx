import "../global.css";
import { SessionProvider, useSession } from "@/auth/SessionProvider";
import { queryClient } from "@/lib/queryClient";
import { startSupabaseAutoRefresh } from "@/lib/supabase";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";

// Sends the user to the auth stack when signed out and into the app when
// signed in. Runs only after the persisted session has been read back.
function useProtectedRoute() {
  const { session, initializing } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (session && inAuthGroup) {
      router.replace("/(app)");
    }
  }, [session, initializing, segments, router]);

  return initializing;
}

function RootNavigator() {
  const initializing = useProtectedRoute();

  if (initializing) {
    return <View className="flex-1 bg-background" />;
  }

  return <Slot />;
}

export default function RootLayout() {
  useEffect(() => {
    startSupabaseAutoRefresh();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </SessionProvider>
    </QueryClientProvider>
  );
}
