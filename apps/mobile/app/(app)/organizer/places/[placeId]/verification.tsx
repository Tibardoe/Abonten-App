import VerificationScreen from "@/components/verification/VerificationScreen";
import { useLocalSearchParams } from "expo-router";

// Per-place verification — the mobile twin of the web ManagePlaceView's
// Verification tab.
export default function PlaceVerificationScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  return <VerificationScreen subjectType="place" subjectId={placeId ?? ""} />;
}
