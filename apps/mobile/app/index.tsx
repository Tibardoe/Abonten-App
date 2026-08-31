import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

export default function Home() {
  const [sessionState, setSessionState] = useState("checking session…");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionState(
        data.session ? `signed in as ${data.session.user.id}` : "signed out",
      );
    });
  }, []);

  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background px-6">
      <Text className="text-3xl font-bold text-mint">Abonten</Text>
      <Text className="text-sm text-muted-foreground">
        Mobile skeleton — Phase 4.3 (native Supabase client)
      </Text>
      <Text className="text-xs text-foreground">{sessionState}</Text>
    </View>
  );
}
