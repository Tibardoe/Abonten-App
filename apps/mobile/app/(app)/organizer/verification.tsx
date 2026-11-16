import { useSession } from "@/auth/SessionProvider";
import VerificationScreen from "@/components/verification/VerificationScreen";
import { TeamRoleBlocked } from "@/features/teams/ManagingAs";
import { useActingTeams } from "@/features/teams/useTeams";
import { AppText } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { View } from "react-native";

// Organizer verification — the mobile twin of /manage/verification on web.
// The subject is the account being managed: the signed-in user, or the
// team they manage as when their role covers verification.request (Owners:
// the business check). The service enforces that rather than trusting the
// id this screen sends.
export default function OrganizerVerificationScreen() {
  const t = useTranslations("manage");

  const { session } = useSession();
  const userId = session?.user.id;
  const { current, can } = useActingTeams();

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <AppText tone="muted" className="text-center">
          {t("signInToManageYourOrganizer")}
        </AppText>
      </View>
    );
  }

  if (current && !can("verification.request")) return <TeamRoleBlocked />;

  return (
    <VerificationScreen
      subjectType="organizer"
      subjectId={current?.teamId ?? userId}
    />
  );
}
