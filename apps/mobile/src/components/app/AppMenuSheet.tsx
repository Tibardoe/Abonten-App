import { useSession } from "@/auth/SessionProvider";
import { unregisterPushToken } from "@/features/notifications/usePushRegistration";
import { useProfile } from "@/features/profile/useProfile";
import {
  AppText,
  Avatar,
  Button,
  Divider,
  Icon,
  type IoniconName,
  Label,
  Sheet,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import { AppearanceToggle } from "./AppearanceToggle";
import { useMenuSheet } from "./menuSheet";

// Native stand-in for the web header's hamburger → <SideBar> Sheet: the same
// Create / Manage / account links, appearance control, sign-out, and legal
// footer, in a bottom sheet. Mounted once from (app)/_layout.tsx.

const WEBSITE = "https://abontenhub.com";

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg px-1 py-3 active:opacity-70"
    >
      <Icon
        name={icon}
        size={20}
        tone={destructive ? "destructive" : "muted"}
      />
      <AppText
        className={`flex-1 text-[15px] ${
          destructive ? "text-destructive" : "text-foreground"
        }`}
      >
        {label}
      </AppText>
      {!destructive ? (
        <Icon name="chevron-forward" size={16} tone="muted" />
      ) : null}
    </Pressable>
  );
}

export function AppMenuSheet() {
  const { open, setOpen } = useMenuSheet();
  const { session, signOut } = useSession();
  const { data: profile } = useProfile();
  const router = useRouter();
  const t = useTranslations("navigation");
  const tSettings = useTranslations("settings");

  const close = () => setOpen(false);
  const go = (path: string) => {
    close();
    router.push(path);
  };
  const openWeb = () => {
    close();
    Linking.openURL(WEBSITE).catch(() => {});
  };

  return (
    <Sheet open={open} onClose={close}>
      {session ? (
        <>
          <Pressable
            onPress={() => go("/(app)/account")}
            className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
          >
            <Avatar
              publicId={profile?.avatar_public_id}
              version={profile?.avatar_version}
              size={44}
            />
            <View className="flex-1">
              <AppText className="text-[15px] font-semibold text-foreground">
                {profile?.full_name ?? profile?.username ?? "Your account"}
              </AppText>
              {profile?.username ? (
                <AppText className="text-[12px] text-muted-foreground">
                  @{profile.username}
                </AppText>
              ) : null}
            </View>
            <Icon name="chevron-forward" size={16} tone="muted" />
          </Pressable>

          <Label className="mb-1 mt-3">{t("create")}</Label>
          <Row
            icon="add-circle-outline"
            label="Create event"
            onPress={openWeb}
          />
          <Row
            icon="storefront-outline"
            label="Create place"
            onPress={openWeb}
          />

          <Label className="mb-1 mt-3">{t("manage")}</Label>
          <Row
            icon="grid-outline"
            label={t("dashboard")}
            onPress={() => go("/(app)/organizer")}
          />
          <Row
            icon="calendar-outline"
            label={t("manageEvents")}
            onPress={() => go("/(app)/organizer/events")}
          />
          <Row
            icon="wallet-outline"
            label={t("finances")}
            onPress={() => go("/(app)/organizer/finance")}
          />

          <Label className="mb-1 mt-3">{t("account")}</Label>
          <Row
            icon="receipt-outline"
            label={t("myEvents")}
            onPress={() => go("/(app)/tickets")}
          />
          <Row
            icon="card-outline"
            label={t("wallets")}
            onPress={() => go("/(app)/wallet")}
          />
          <Row
            icon="location-outline"
            label={t("places")}
            onPress={() => go("/(app)/places")}
          />
          <Row
            icon="notifications-outline"
            label="Notifications"
            onPress={() => go("/(app)/notifications")}
          />
        </>
      ) : (
        <>
          <Row
            icon="log-in-outline"
            label={t("signIn")}
            onPress={() => go("/(auth)/sign-in")}
          />
          <Row
            icon="person-add-outline"
            label={t("signUp")}
            onPress={() => go("/(auth)/sign-in")}
          />
        </>
      )}

      <Label className="mb-2 mt-4">{tSettings("appearance.title")}</Label>
      <AppearanceToggle />

      {session ? (
        <Button
          title={t("signOut")}
          variant="outline"
          className="mt-5 border-destructive"
          onPress={async () => {
            close();
            await unregisterPushToken();
            await signOut();
          }}
        />
      ) : null}

      <Divider className="my-5" />

      <View className="gap-3">
        {["Terms & Conditions", "Privacy", "Cookies", "Security"].map(
          (label) => (
            <Pressable
              key={label}
              onPress={openWeb}
              className="active:opacity-60"
            >
              <AppText className="text-[13px] text-muted-foreground">
                {label}
              </AppText>
            </Pressable>
          ),
        )}
        <AppText className="mt-1 text-[12px] text-muted-foreground">
          © {new Date().getFullYear()} Abonten Hub
        </AppText>
      </View>
    </Sheet>
  );
}
