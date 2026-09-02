import { AppHeader } from "@/components/app/AppHeader";
import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

// Native echo of the web SettingsDesktopSidebar — the same five entries,
// same order, same `settings.nav.*` labels.
const ITEMS: {
  key: string;
  route: string;
  icon: IoniconName;
  labelKey: string;
}[] = [
  {
    key: "overview",
    route: "/(app)/settings/overview",
    icon: "home-outline",
    labelKey: "nav.overview",
  },
  {
    key: "edit-profile",
    route: "/(app)/settings/edit-profile",
    icon: "person-outline",
    labelKey: "nav.editProfile",
  },
  {
    key: "security",
    route: "/(app)/settings/security",
    icon: "shield-checkmark-outline",
    labelKey: "nav.security",
  },
  {
    key: "switch-appearance",
    route: "/(app)/settings/switch-appearance",
    icon: "contrast-outline",
    labelKey: "nav.switchAppearance",
  },
  {
    key: "language",
    route: "/(app)/settings/language",
    icon: "language-outline",
    labelKey: "nav.language",
  },
];

export default function SettingsHub() {
  const router = useRouter();
  const t = useTranslations("settings");

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title="Settings"
        backFallback="/(app)/account"
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-2 p-4"
      >
        {ITEMS.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={() => router.push(item.route)}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 active:opacity-80"
          >
            <Icon name={item.icon} size={20} tone="muted" />
            <AppText className="flex-1 text-[15px] text-foreground">
              {t(item.labelKey)}
            </AppText>
            <Icon name="chevron-forward" size={16} tone="muted" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
