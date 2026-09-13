import { WeeklyScreen } from "@/components/weekly/WeeklyScreen";
import { useLocalSearchParams } from "expo-router";

// One dated edition (from the Explore teaser, a shared link or a push).
export default function WeeklyDated() {
  const { scope, week } = useLocalSearchParams<{
    scope: string;
    week: string;
  }>();
  return <WeeklyScreen scope={scope} week={week} />;
}
