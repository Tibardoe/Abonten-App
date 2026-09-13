import { WeeklyScreen } from "@/components/weekly/WeeklyScreen";
import { useLocalSearchParams } from "expo-router";

// This week's Abonten Weekly for the explored area, or for ?scope= when
// opened from an abontenhub.com/weekly/<area> link.
export default function WeeklyCurrent() {
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  return <WeeklyScreen scope={typeof scope === "string" ? scope : undefined} />;
}
