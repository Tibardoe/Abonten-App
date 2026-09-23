import { useProfileCompletion } from "@/features/profile/useProfileCompletion";
import { AppText, Icon } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// Shown above the Edit Profile fields while a profile step (name, a chosen
// username, a photo) is still missing — all three are fixed on this screen,
// so the rows aren't links. The sign-in steps (email, phone) live on
// Account setup, linked underneath. Gone once the profile steps are done.

export function ProfileCompletionCard() {
  const { data: completion } = useProfileCompletion();
  const router = useRouter();

  if (!completion) return null;
  const missing = completion.items.filter(
    (i) => i.group === "profile" && !i.complete,
  );
  if (missing.length === 0) return null;

  return (
    <View className="gap-3 rounded-xl border border-border bg-muted p-4">
      <AppText variant="bodyStrong">Finish your profile</AppText>
      <View className="gap-2">
        {missing.map((item) => (
          <View key={item.key} className="flex-row gap-2">
            <Icon
              name="ellipse-outline"
              size={18}
              tone="muted"
              style={{ marginTop: 1 }}
            />
            <View className="flex-1">
              <AppText variant="small" className="font-semibold">
                {item.label}
              </AppText>
              <AppText variant="caption">{item.description}</AppText>
            </View>
          </View>
        ))}
      </View>
      {!completion.isComplete ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(app)/settings/account-setup")}
          className="flex-row items-center gap-1 self-start active:opacity-60"
        >
          <AppText variant="small" tone="brand" className="font-semibold">
            See all account setup steps ({completion.completedCount} of{" "}
            {completion.total} done)
          </AppText>
          <Icon name="chevron-forward" size={14} tone="primary" />
        </Pressable>
      ) : null}
    </View>
  );
}
