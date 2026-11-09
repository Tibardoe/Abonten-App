import { EmptyState } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { View } from "react-native";

// A link that opens no screen in the app. expo-router's own page ("Unmatched
// Route", the raw link and a Sitemap button) is a developer screen; people
// get the website's wording and a way home instead.
export default function NotFoundScreen() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <View className="flex-1 justify-center bg-background">
      <EmptyState
        icon="compass-outline"
        title={t("weCouldntFindThatPage")}
        description={t("theLinkMayBeOutOfDate")}
        actionLabel={t("goToTheHomePage")}
        onAction={() => router.replace("/(app)/(tabs)")}
      />
    </View>
  );
}
