import { useProfileCompletion } from "@/features/profile/useProfileCompletion";
import { AppText, Icon } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// Native echo of the web ProfileCompletionChecklist — the 4-item list shown
// above the Edit Profile fields; disappears once every item is done. Web
// hrefs (`/settings/edit-profile`, `/settings/security`) map to the mobile
// routes of the same name.

const HREF_MAP: Record<string, string> = {
  "/settings/edit-profile": "/(app)/settings/edit-profile",
  "/settings/security": "/(app)/settings/security",
};

export function ProfileCompletionCard() {
  const { data: completion } = useProfileCompletion();
  const router = useRouter();

  if (!completion || completion.isComplete) return null;

  return (
    <View className="gap-3 rounded-xl border border-border bg-muted p-4">
      <View className="flex-row items-center justify-between">
        <AppText variant="bodyStrong">Complete your profile</AppText>
        <AppText variant="caption">
          {completion.completedCount}/{completion.total}
        </AppText>
      </View>

      <View className="gap-2">
        {completion.items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => router.push(HREF_MAP[item.href] ?? item.href)}
            className="flex-row items-center gap-2 active:opacity-70"
          >
            <Icon
              name={item.complete ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              tone={item.complete ? "success" : "muted"}
            />
            <AppText
              variant="small"
              className={
                item.complete ? "text-muted-foreground line-through" : ""
              }
            >
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
