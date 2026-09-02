import { StepDots } from "@/components/StepDots";
import { PlaceWizardBasicInfo } from "@/components/places/PlaceWizardBasicInfo";
import { PlaceWizardCover } from "@/components/places/PlaceWizardCover";
import { PlaceWizardHours } from "@/components/places/PlaceWizardHours";
import { PlaceWizardReview } from "@/components/places/PlaceWizardReview";
import { usePlaceDrafts } from "@/features/places/usePlaceDrafts";
import { usePlaceWizard } from "@/features/places/usePlaceWizard";
import { ScreenLoader } from "@abonten/ui-native";
import {
  Link,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useEffect } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

// Native echo of the web PlaceUploadModal: a 4-step wizard — Basic info,
// Cover photo, Hours, Review — that publishes a place via useCreatePlace.
// With `?draftId=`, it resumes a saved draft; the "Save as draft" button
// (WP-4g-3) writes the same drafts/place_drafts rows the web savePlaceDraft
// action does.

const STEP_TITLES = [
  "Create place · Basic info",
  "Create place · Cover photo",
  "Create place · Hours",
  "Create place · Review",
];

export default function CreatePlaceScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const w = usePlaceWizard(draftId);
  const draftsList = usePlaceDrafts();
  const draftCount =
    draftsList.data?.status === 200 ? draftsList.data.data.length : 0;

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

  async function onSaveDraft() {
    const res = await w.saveDraft();
    if (res.status === 200) {
      Alert.alert("Draft saved", "Pick it back up any time from Place drafts.");
    } else {
      Alert.alert("Couldn't save draft", res.message ?? "Please try again.");
    }
  }

  if (w.categoriesLoading || w.isHydratingDraft) return <ScreenLoader />;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center justify-between">
        <StepDots step={w.step} total={4} />
        <Pressable
          onPress={onSaveDraft}
          disabled={w.isSavingDraft}
          className="active:opacity-60 disabled:opacity-50"
        >
          <Text className="text-sm font-semibold text-primary">
            {w.isSavingDraft ? "Saving…" : "Save as draft"}
          </Text>
        </Pressable>
      </View>

      {w.draftLoadError ? (
        <Text className="text-sm text-destructive">{w.draftLoadError}</Text>
      ) : null}

      {!draftId && draftCount > 0 ? (
        <Link href="/(app)/organizer/place-drafts" asChild>
          <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
            <Text className="text-sm text-foreground">
              You have {draftCount} saved draft{draftCount === 1 ? "" : "s"}
            </Text>
            <Text className="text-primary">Resume ›</Text>
          </Pressable>
        </Link>
      ) : null}

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
