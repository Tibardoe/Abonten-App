import type { UsernameCheckState } from "@/features/profile/useUsernameCheck";
import { AppText, Chip } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// What the as-you-type username check found, under a username field:
// checking, available, or taken with two or three free handles to tap
// (they fill the field). Nothing while the field is empty, malformed (the
// form says why) or unchanged.
export function UsernameHint({
  check,
  onPick,
}: {
  check: UsernameCheckState;
  /** A suggestion was tapped: put it in the field. */
  onPick: (username: string) => void;
}) {
  const t = useTranslations("common");
  if (check.state === "idle") return null;
  if (check.state === "checking") {
    return <AppText variant="caption">{t("usernameChecking")}</AppText>;
  }
  if (check.state === "failed") {
    return <AppText variant="caption">{t("usernameCheckFailed")}</AppText>;
  }
  if (check.state === "available") {
    return (
      <AppText variant="small" tone="success" accessibilityLiveRegion="polite">
        {t("usernameAvailable", { username: check.username })}
      </AppText>
    );
  }
  return (
    <View className="gap-2">
      <AppText variant="small" tone="error" accessibilityLiveRegion="polite">
        {t("usernameTaken", { username: check.username })}
      </AppText>
      {check.suggestions.length > 0 ? (
        <View className="gap-1.5">
          <AppText variant="caption">{t("usernameSuggestions")}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {check.suggestions.map((suggestion) => (
              <Chip
                key={suggestion}
                label={`@${suggestion}`}
                onPress={() => onPick(suggestion)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
