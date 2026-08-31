import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function Account() {
  const { session, signOut } = useSession();

  const profile = useQuery({
    queryKey: ["mobile", "profile"],
    queryFn: () => api.profile.get(),
    enabled: !!session,
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-6 py-16"
    >
      <Text className="text-2xl font-bold text-foreground">Account</Text>

      <View className="gap-1 rounded-md border border-border bg-card p-4">
        <Text className="text-xs uppercase text-muted-foreground">Session</Text>
        <Text className="text-sm text-foreground">
          {session ? session.user.id : "none"}
        </Text>
        {session?.user.phone ? (
          <Text className="text-xs text-muted-foreground">
            {session.user.phone}
          </Text>
        ) : null}
      </View>

      <View className="gap-1 rounded-md border border-border bg-card p-4">
        <Text className="text-xs uppercase text-muted-foreground">
          GET /api/mobile/profile
        </Text>
        <Text className="text-sm text-foreground">
          {profile.isLoading
            ? "loading…"
            : profile.isError
              ? "request failed"
              : `status ${profile.data?.status ?? "?"}`}
        </Text>
      </View>

      <Pressable
        className="items-center rounded-md border border-destructive px-4 py-3 active:opacity-80"
        onPress={() => signOut()}
      >
        <Text className="text-base font-semibold text-destructive">
          Sign out
        </Text>
      </Pressable>
    </ScrollView>
  );
}
