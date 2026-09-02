import { StepDots } from "@/components/StepDots";
import { AppHeader } from "@/components/app/AppHeader";
import { PlaceWizardBasicInfo } from "@/components/places/PlaceWizardBasicInfo";
import { PlaceWizardCover } from "@/components/places/PlaceWizardCover";
import { PlaceWizardHours } from "@/components/places/PlaceWizardHours";
import { PlaceWizardReview } from "@/components/places/PlaceWizardReview";
import { usePlaceDrafts } from "@/features/places/usePlaceDrafts";
import { usePlaceWizard } from "@/features/places/usePlaceWizard";
import { AppText, ScreenLoader, ScreenTitle } from "@abonten/ui-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

// Native echo of the web PlaceUploadModal: a 4-step wizard that publishes a
// place via useCreatePlace. With `?draftId=`, it resumes a saved draft; the
// "Save as draft" button writes the same drafts/place_drafts rows the web
// savePlaceDraft action does.
//
// The cover photo comes first — consistent with Create Event, and it's what
// a listing is recognised by. Then Basic info → Hours → Review. Navigation
// lives in the header: Back steps back (or leaves the flow from step 0),
// Next / Publish advances; per-step gates come from `w.canAdvance`, except
// Basic info which validates on Next-press.

const STEPS: { title: string; subtitle: string }[] = [
  {
    title: "Cover photo",
    subtitle: "The image people recognise the place by — add it first.",
  },
  {
    title: "Basic info",
    subtitle: "Name, category, description and address.",
  },
  { title: "Opening hours", subtitle: "When the place is open." },
  { title: "Review & publish", subtitle: "Check everything, then go live." },
];
const LAST_STEP = STEPS.length - 1;
const BASICS_STEP = 1;

export default function CreatePlaceScreen() {
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const w = usePlaceWizard(draftId);
  const draftsList = usePlaceDrafts();
  const draftCount =
    draftsList.data?.status === 200 ? draftsList.data.data.length : 0;

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

  function goBack() {
    if (w.step === 0) {
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/organizer");
      return;
    }
    w.setStep(w.step - 1);
  }

  function goNext() {
    if (w.step === LAST_STEP) {
      onPublish();
      return;
    }
    if (w.step === BASICS_STEP && !w.validateBasics()) return;
    w.setStep(w.step + 1);
  }

  async function onSaveDraft() {
    const res = await w.saveDraft();
    if (res.status === 200) {
      Alert.alert("Draft saved", "Pick it back up any time from Place drafts.");
    } else {
      Alert.alert("Couldn't save draft", res.message ?? "Please try again.");
    }
  }

  const header = (
    <AppHeader
      variant="form"
      title="Create Place"
      onBack={goBack}
      onNext={goNext}
      nextLabel={w.step === LAST_STEP ? "Publish" : "Next"}
      nextDisabled={w.isSubmitting || (w.step !== BASICS_STEP && !w.canAdvance)}
    />
  );

  if (w.categoriesLoading || w.isHydratingDraft) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenLoader />
      </View>
    );
  }

  const stepInfo = STEPS[w.step];

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <StepDots step={w.step} total={STEPS.length} />
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

          <View className="gap-0.5">
            <AppText variant="caption">
              Step {w.step + 1} of {STEPS.length}
            </AppText>
            <ScreenTitle>{stepInfo.title}</ScreenTitle>
            <AppText variant="muted">{stepInfo.subtitle}</AppText>
          </View>
        </View>

        {w.draftLoadError ? (
          <Text className="text-sm text-destructive">{w.draftLoadError}</Text>
        ) : null}

        {!draftId && draftCount > 0 && w.step === 0 ? (
          <Link href="/(app)/organizer/place-drafts" asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <Text className="text-sm text-foreground">
                You have {draftCount} saved draft{draftCount === 1 ? "" : "s"}
              </Text>
              <Text className="text-primary">Resume ›</Text>
            </Pressable>
          </Link>
        ) : null}

        {w.step === 0 ? <PlaceWizardCover w={w} /> : null}
        {w.step === 1 ? <PlaceWizardBasicInfo w={w} /> : null}
        {w.step === 2 ? <PlaceWizardHours w={w} /> : null}
        {w.step === 3 ? <PlaceWizardReview w={w} /> : null}
      </ScrollView>
    </View>
  );
}
