import { useSession } from "@/auth/SessionProvider";
import { AppText, Card, Divider, Icon } from "@abonten/ui-native";
import { ScrollView, View } from "react-native";

// Native echo of the web settings/security page. The web version wires the
// full Hubtel OTP change-phone / change-email flows; on mobile those are
// tied to the phone-auth path that is still half-wired (see CLAUDE.md), so
// this is a read-only summary for now — email, phone, verified state, and
// the linked Google identity — with a note to manage changes on the web.

function Line({
  label,
  value,
  verified,
}: {
  label: string;
  value: string;
  verified?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-1">
        <AppText variant="caption">{label}</AppText>
        <AppText variant="body">{value}</AppText>
      </View>
      {verified === undefined ? null : verified ? (
        <View className="flex-row items-center gap-1">
          <Icon name="checkmark-circle" size={16} color="#22c55e" />
          <AppText className="text-[12px] text-primary">Verified</AppText>
        </View>
      ) : (
        <AppText className="text-[12px] text-muted-foreground">
          Unverified
        </AppText>
      )}
    </View>
  );
}

export default function Security() {
  const { session } = useSession();
  const user = session?.user;

  const google = (user?.identities ?? []).some((i) => i.provider === "google");

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4"
    >
      <Card padded>
        <Line
          label="Email"
          value={user?.email || "No email added"}
          verified={user?.email ? !!user.email_confirmed_at : undefined}
        />
        <Divider />
        <Line
          label="Phone"
          value={user?.phone || "No phone number added"}
          verified={user?.phone ? !!user.phone_confirmed_at : undefined}
        />
        <Divider />
        <Line label="Google" value={google ? "Linked" : "Not linked"} />
      </Card>

      <AppText variant="caption">
        To change your email or phone number, or to manage sign-in methods, use
        the Abonten website for now.
      </AppText>
    </ScrollView>
  );
}
