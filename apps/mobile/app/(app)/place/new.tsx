import { PlaceWizardBasicInfo } from "@/components/places/PlaceWizardBasicInfo";
import { PlaceWizardCover } from "@/components/places/PlaceWizardCover";
import { PlaceWizardHours } from "@/components/places/PlaceWizardHours";
import { PlaceWizardReview } from "@/components/places/PlaceWizardReview";
import { StepDots } from "@/components/places/StepDots";
import { usePlaceWizard } from "@/features/places/usePlaceWizard";
import { ScreenLoader } from "@abonten/ui-native";
import { useNavigation, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, ScrollView } from "react-native";

// Native echo of the web PlaceUploadModal (Places Milestone 3): a 4-step
// wizard — Basic info, Cover photo, Hours, Review — that publishes a place
// via useCreatePlace (signed Cloudinary upload + POST /api/mobile/places →
// the same postPlaceCore the web postPlace action runs). All state and
// logic live in usePlaceWizard (the mobile echo of usePlaceUploadForm);
// this file is just the step switch + navigation. Save-as-draft is WP-4g.

const STEP_TITLES = [
  "Create place · Basic info",
  "Create place · Cover photo",
  "Create place · Hours",
  "Create place · Review",
];

export default function CreatePlaceScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const w = usePlaceWizard();

  useEffect(() => {
    navigation.setOptions({ title: STEP_TITLES[w.step] });
  }, [navigation, w.step]);

  async function onPublish() {
    const res = await w.submit();
    if (!res) return;

    if (res.status === 200 && "placeId" in res) {
      Alert.alert("Place published", "Your place is now live.", [
        {
          text: "View it",
          onPress: () => router.replace(`/(app)/place/${res.placeId}`),
        },
      ]);
      return;
    }

    Alert.alert(
      "Couldn't publish",
      res.message ?? "Something went wrong. Please try again.",
    );
  }

  if (w.categoriesLoading) return <ScreenLoader />;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <StepDots step={w.step} total={4} />

      {w.step === 0 ? (
        <PlaceWizardBasicInfo
          w={w}
          onNext={() => {
            if (w.validateBasics()) w.setStep(1);
          }}
        />
      ) : null}

      {w.step === 1 ? (
        <PlaceWizardCover
          w={w}
          onBack={() => w.setStep(0)}
          onNext={() => w.setStep(2)}
        />
      ) : null}

      {w.step === 2 ? (
        <PlaceWizardHours
          w={w}
          onBack={() => w.setStep(1)}
          onNext={() => w.setStep(3)}
        />
      ) : null}

      {w.step === 3 ? (
        <PlaceWizardReview
          w={w}
          onBack={() => w.setStep(2)}
          onPublish={onPublish}
        />
      ) : null}
    </ScrollView>
  );
}
