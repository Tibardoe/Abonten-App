import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { AppearanceToggle } from "@/components/app/AppearanceToggle";
import { unregisterPushToken } from "@/features/notifications/usePushRegistration";
import { useProfile } from "@/features/profile/useProfile";
import { useIsOrganizer } from "@/features/roles/useRoles";
import {
  AppText,
  Avatar,
  Button,
  Card,
  Divider,
  Icon,
  type IoniconName,
  Label,
  PressableCard,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

function NavRow({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-80"
    >
      <Icon name={icon} size={20} tone="muted" />
      <AppText className="flex-1 text-[15px] text-foreground">{label}</AppText>
      <Icon name="chevron-forward" size={16} tone="muted" />
    </Pressable>
  );
}

export default function Account() {
  const { session, signOut } = useSession();
  const { data: profile } = useProfile();
  const isOrganizer = useIsOrganizer();
  const router = useRouter();
  const t = useTranslations("navigation");
  const tSettings = useTranslations("settings");

  async function onSignOut() {
    await unregisterPushToken();
    await signOut();
  }

  if (!session) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader variant="branded" />
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-6 px-6 py-10"
        >
          <View className="items-center gap-2">
            <Icon name="person-circle-outline" size={48} tone="muted" />
            <AppText className="text-[18px] font-bold text-foreground">
              Sign in to Abonten
            </AppText>
            <AppText className="text-center text-[13px] text-muted-foreground">
              Sign in to buy tickets, save favourites, and manage your events.
            </AppText>
          </View>
          <Button
            title={t("signIn")}
            onPress={() => router.push("/(auth)/sign-in")}
          />

          <View className="gap-2">
            <Label>{tSettings("appearance.title")}</Label>
            <AppearanceToggle />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="branded" />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 px-4 py-6"
      >
        {(() => {
          const body = (
            <>
              <Avatar
                publicId={profile?.avatar_public_id}
                version={profile?.avatar_version}
                size={52}
              />
              <View className="flex-1">
                <AppText className="text-[16px] font-semibold text-foreground">
                  {profile?.full_name ?? profile?.username ?? "Your account"}
                </AppText>
                {profile?.username ? (
                  <AppText className="text-[13px] text-muted-foreground">
                    @{profile.username}
                  </AppText>
                ) : session.user.phone ? (
                  <AppText className="text-[13px] text-muted-foreground">
                    {session.user.phone}
                  </AppText>
                ) : null}
              </View>
              {profile?.username ? (
                <Icon name="chevron-forward" size={16} tone="muted" />
              ) : null}
            </>
          );
          return profile?.username ? (
            <PressableCard
              className="flex-row items-center gap-3"
              onPress={() => router.push(`/(app)/user/${profile.username}`)}
            >
              {body}
            </PressableCard>
          ) : (
            <Card className="flex-row items-center gap-3">{body}</Card>
          );
        })()}

        <View className="gap-2">
          <NavRow
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push("/(app)/settings")}
          />
          <NavRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/(app)/notifications")}
          />
          <NavRow
            icon="receipt-outline"
            label={t("myEvents")}
            onPress={() => router.push("/(app)/tickets")}
          />
          <NavRow
            icon="swap-horizontal-outline"
            label="Transactions"
            onPress={() => router.push("/(app)/transactions")}
          />
          <NavRow
            icon="card-outline"
            label={t("wallets")}
            onPress={() => router.push("/(app)/wallet")}
          />
          <NavRow
            icon="location-outline"
            label={t("places")}
            onPress={() => router.push("/(app)/places")}
          />
          {isOrganizer ? (
            <NavRow
              icon="grid-outline"
              label="Organizer"
              onPress={() => router.push("/(app)/organizer")}
            />
          ) : null}
        </View>

        <View className="gap-2">
          <Label>{tSettings("appearance.title")}</Label>
          <AppearanceToggle />
        </View>

        <Divider />

        <Button
          title={t("signOut")}
          variant="outline"
          className="border-destructive"
          onPress={onSignOut}
        />
      </ScrollView>
    </View>
  );
}
