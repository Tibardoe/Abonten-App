import { StepDots } from "@/components/StepDots";
import { StepTransition } from "@/components/StepTransition";
import { UploadProgress } from "@/components/UploadProgress";
import { AppHeader } from "@/components/app/AppHeader";
import { PlaceWizardBasicInfo } from "@/components/places/PlaceWizardBasicInfo";
import { PlaceWizardCover } from "@/components/places/PlaceWizardCover";
import { PlaceWizardHours } from "@/components/places/PlaceWizardHours";
import { PlaceWizardPhotos } from "@/components/places/PlaceWizardPhotos";
import { PlaceWizardReview } from "@/components/places/PlaceWizardReview";
import { FormSkeleton } from "@/components/skeletons";
import { usePlaceDrafts } from "@/features/places/usePlaceDrafts";
import { usePlaceWizard } from "@/features/places/usePlaceWizard";
import {
  AppText,
  Hero,
  KeyboardAwareScrollView,
  Overline,
  useToast,
} from "@abonten/ui-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";

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
    title: "Gallery photos",
    subtitle: "Optional — a few shots of the space. Add more later any time.",
  },
  {
    title: "Basic info",
    subtitle: "Name, category, description and address.",
  },
  { title: "Opening hours", subtitle: "When the place is open." },
  { title: "Review & publish", subtitle: "Check everything, then go live." },
];
const LAST_STEP = STEPS.length - 1;
const BASICS_STEP = 2;

export default function CreatePlaceScreen() {
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const toast = useToast();
  const w = usePlaceWizard(draftId);
  const draftsList = usePlaceDrafts();
  const draftCount =
    draftsList.data?.status === 200 ? draftsList.data.data.length : 0;

  async function onPublish() {
    const res = await w.submit();
    if (!res) return;

    if (res.status === 200 && "placeId" in res) {
      // Best-effort — never blocks the "published" state. Failures just mean
      // the owner adds those photos from Edit Place instead.
      await w.uploadStagedPhotos(res.placeId);
      // Straight to the published place; the confirmation rides along as a
      // toast rather than an alert to dismiss first.
      router.replace(`/(app)/place/${res.placeId}`);
      toast.success("Place published", {
        description: "It is live and discoverable now.",
      });
      return;
    }

    toast.error(res.message ?? "We couldn't publish your place.", {
      description: "Everything you entered is still here. Try again.",
      action: { label: "Retry", onPress: onPublish },
    });
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
      toast.success("Draft saved", {
        description: "Pick it back up any time from Place drafts.",
      });
    } else {
      toast.error(res.message ?? "We couldn't save your draft.", {
        description: "Nothing was lost — try again.",
        action: { label: "Retry", onPress: onSaveDraft },
      });
    }
  }

  const header = (
    <AppHeader
      variant="form"
      title="Create Place"
      onBack={goBack}
      onNext={goNext}
      nextLabel={
        w.step !== LAST_STEP
          ? "Next"
          : w.uploadingPhotos
            ? "Adding photos…"
            : w.isSubmitting
              ? "Publishing…"
              : "Publish"
      }
      nextLoading={w.isSubmitting || w.uploadingPhotos}
      nextDisabled={w.step !== BASICS_STEP && !w.canAdvance}
    />
  );

  if (w.categoriesLoading || w.isHydratingDraft) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <FormSkeleton fields={4} />
      </View>
    );
  }

  const stepInfo = STEPS[w.step];

  return (
    <View className="flex-1 bg-background">
      {header}
      <KeyboardAwareScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4"
      >
        <View className="gap-3.5">
          <View className="flex-row items-center justify-between">
            <StepDots step={w.step} total={STEPS.length} />
            <Pressable
              onPress={onSaveDraft}
              disabled={w.isSavingDraft}
              hitSlop={8}
              className="active:opacity-60 disabled:opacity-50"
            >
              <AppText variant="small" tone="brand" className="font-semibold">
                {w.isSavingDraft ? "Saving…" : "Save as draft"}
              </AppText>
            </Pressable>
          </View>

          <View className="gap-1">
            <Overline>
              Step {w.step + 1} of {STEPS.length}
            </Overline>
            <Hero>{stepInfo.title}</Hero>
            <AppText variant="muted">{stepInfo.subtitle}</AppText>
          </View>
        </View>

        {/* Real byte progress for the cover + staged gallery photos — a
            publish over a slow connection is otherwise indistinguishable
            from a frozen app. */}
        <UploadProgress
          state={w.uploadProgress}
          what={w.uploadingPhotos ? "photos" : "cover photo"}
        />

        {w.draftLoadError ? (
          <AppText variant="small" tone="error">
            {w.draftLoadError}
          </AppText>
        ) : null}

        {!draftId && draftCount > 0 && w.step === 0 ? (
          <Link href="/(app)/organizer/place-drafts" asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText variant="body">
                You have {draftCount} saved draft{draftCount === 1 ? "" : "s"}
              </AppText>
              <AppText variant="small" tone="brand" className="font-semibold">
                Resume ›
              </AppText>
            </Pressable>
          </Link>
        ) : null}

        <StepTransition step={w.step}>
          {w.step === 0 ? <PlaceWizardCover w={w} /> : null}
          {w.step === 1 ? <PlaceWizardPhotos w={w} /> : null}
          {w.step === 2 ? <PlaceWizardBasicInfo w={w} /> : null}
          {w.step === 3 ? <PlaceWizardHours w={w} /> : null}
          {w.step === 4 ? <PlaceWizardReview w={w} /> : null}
        </StepTransition>
      </KeyboardAwareScrollView>
    </View>
  );
}
