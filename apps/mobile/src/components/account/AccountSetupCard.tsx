import {
  useAccountSetupPrompt,
  useProfileCompletion,
} from "@/features/profile/useProfileCompletion";
import { accountSetupPromptMessage } from "@abonten/core/accountSetupPrompt";
import { AppText, Button, Icon, ProgressBar } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// The "Finish setting up your account" reminder.
//
//   variant "reminder" (Home): a card in the feed, never a pop-up. "Not now"
//     puts it away for 7, then 30, then 90 days (accountSetupPromptVisible),
//     on every device. It never comes back once everything is done.
//   variant "row" (Account tab): a quiet, always-there link while anything is
//     left — the place people go looking for it. Not dismissible, and not
//     counted as a reminder.
//
// Steps an action actually needs are asked for at that moment instead (an
// email at checkout), whatever this card's state.

const SETUP_HREF = "/(app)/settings/account-setup";

export function AccountSetupCard({
  variant = "reminder",
  className,
}: {
  variant?: "reminder" | "row";
  /** Outer spacing — applied only when the card is actually shown. */
  className?: string;
}) {
  const router = useRouter();
  const prompt = useAccountSetupPrompt();
  const completion = useProfileCompletion();

  if (variant === "row") {
    const c = completion.data;
    if (!c || c.isComplete) return null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Finish setting up your account. ${c.completedCount} of ${c.total} steps done.`}
        onPress={() => router.push(SETUP_HREF)}
        className={`flex-row items-center gap-3 rounded-xl border border-primary/40 bg-card px-4 py-3 active:opacity-80 ${className ?? ""}`}
      >
        <Icon name="checkmark-done-outline" size={20} tone="primary" />
        <View className="flex-1">
          <AppText variant="body">Finish setting up your account</AppText>
          <AppText variant="caption">
            {c.completedCount} of {c.total} steps done
          </AppText>
        </View>
        <Icon name="chevron-forward" size={16} tone="muted" />
      </Pressable>
    );
  }

  if (!prompt.visible || !prompt.completion) return null;
  const c = prompt.completion;
  const message = accountSetupPromptMessage(c);

  return (
    <View
      className={`gap-3 rounded-xl border border-border bg-card p-4 ${className ?? ""}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
          <Icon name="person-circle-outline" size={22} tone="primary" />
        </View>
        <View className="flex-1 gap-0.5">
          <AppText variant="bodyStrong">{message.title}</AppText>
          <AppText variant="meta">{message.body}</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now — hide this reminder"
          hitSlop={10}
          onPress={() => prompt.dismiss()}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
        >
          <Icon name="close" size={18} tone="muted" />
        </Pressable>
      </View>
      <ProgressBar
        value={c.completedCount / c.total}
        label={`${c.completedCount} of ${c.total} steps done`}
      />
      <View className="flex-row gap-2">
        <Button
          title="Continue setup"
          size="sm"
          className="flex-1"
          onPress={() => router.push(SETUP_HREF)}
        />
        <Button
          title="Not now"
          variant="ghost"
          size="sm"
          onPress={() => prompt.dismiss()}
        />
      </View>
    </View>
  );
}
