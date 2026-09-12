import { useSession } from "@/auth/SessionProvider";
import VerificationScreen from "@/components/verification/VerificationScreen";
import { AppText } from "@abonten/ui-native";
import { View } from "react-native";

// Organizer verification — the mobile twin of /manage/verification on web.
// The subject is always the signed-in user; the service enforces that
// rather than trusting the id this screen sends.
export default function OrganizerVerificationScreen() {
  const { session } = useSession();
  const userId = session?.user.id;

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <AppText tone="muted" className="text-center">
          Sign in to manage your organizer verification.
        </AppText>
      </View>
    );
  }

  return <VerificationScreen subjectType="organizer" subjectId={userId} />;
}
