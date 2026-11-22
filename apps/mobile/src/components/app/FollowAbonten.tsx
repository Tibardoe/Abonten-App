import { SOCIAL_LINKS } from "@abonten/core/brand/socialLinks";
import { ROUNDUP_CITY } from "@abonten/core/social/roundups";
import { AppText, Card, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { Linking, Pressable, View } from "react-native";
import { SOCIAL_ICON } from "./socialIcons";

// "Follow Abonten for what's on in Accra": Abonten's own channels, offered
// after a purchase or a registration (the web's FollowAbonten). It always
// comes after the screen's main content (the ticket, the confirmation),
// never in its way. The city is the one the channels' roundups cover
// (ROUNDUP_CITY).
export function FollowAbonten() {
  const t = useTranslations("common");

  const title = t("followAbonten.title", { city: ROUNDUP_CITY.name });
  return (
    <Card className="gap-1">
      <AppText variant="bodyStrong" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="small" tone="muted">
        {t("followAbonten.body")}
      </AppText>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {SOCIAL_LINKS.map((link) => (
          <Pressable
            key={link.key}
            accessibilityRole="link"
            accessibilityLabel={t(`abontenOnNetwork.${link.key}`)}
            onPress={() => Linking.openURL(link.href).catch(() => {})}
            className="flex-row items-center gap-1.5 rounded-full border border-border bg-muted px-3.5 py-2 active:opacity-70"
          >
            <Icon name={SOCIAL_ICON[link.key]} size={16} tone="foreground" />
            <AppText className="text-[13px] font-medium text-foreground">
              {link.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
