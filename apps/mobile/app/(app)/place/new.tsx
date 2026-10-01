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
import { useTranslations } from "@abonten/ui-native/i18n";
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

// Catalog keys in the places namespace.
const STEPS: { title: string; subtitle: string }[] = [
  {
    title: "wizardSteps.cover.title",
    subtitle: "wizardSteps.cover.subtitle",
  },
  {
    title: "wizardSteps.gallery.title",
    subtitle: "wizardSteps.gallery.subtitle",
  },
  {
    title: "wizardSteps.basics.title",
    subtitle: "wizardSteps.basics.subtitle",
  },
  { title: "wizardSteps.hours.title", subtitle: "wizardSteps.hours.subtitle" },
  {
    title: "wizardSteps.review.title",
    subtitle: "wizardSteps.review.subtitle",
  },
];
const LAST_STEP = STEPS.length - 1;
const BASICS_STEP = 2;

export default function CreatePlaceScreen() {
  const t = useTranslations("places");

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
      toast.success(t("placePublished"), {
        description: t("itIsLiveAndDiscoverableNow"),
      });
      return;
    }

    toast.error(res.message ?? t("weCouldnTPublishYourPlace"), {
      description: t("everythingYouEnteredIsStillHere"),
      action: { label: t("retry"), onPress: onPublish },
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
      toast.success(t("draftSaved"), {
        description: t("pickItBackUpAnyTime"),
      });
    } else {
      toast.error(res.message ?? t("weCouldnTSaveYourDraft"), {
        description: t("nothingWasLostTryAgain"),
        action: { label: t("retry"), onPress: onSaveDraft },
      });
    }
  }

  const header = (
    <AppHeader
      variant="form"
      title={t("createPlace")}
      onBack={goBack}
      onNext={goNext}
      nextLabel={
        w.step !== LAST_STEP
          ? t("next")
          : w.uploadingPhotos
            ? t("addingPhotos")
            : w.isSubmitting
              ? t("publishing2")
              : t("publish")
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
              accessibilityRole="button"
              onPress={onSaveDraft}
              disabled={w.isSavingDraft}
              hitSlop={8}
              className="active:opacity-60 disabled:opacity-50"
            >
              <AppText variant="small" tone="brand" className="font-semibold">
                {w.isSavingDraft ? t("saving2") : t("saveAsDraft")}
              </AppText>
            </Pressable>
          </View>

          <View className="gap-1">
            <Overline>
              {t("step")} {w.step + 1} {t("ofText", { length: STEPS.length })}
            </Overline>
            <Hero>{t(stepInfo.title)}</Hero>
            <AppText variant="muted">{t(stepInfo.subtitle)}</AppText>
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
                {t("youHaveSavedDraft", { draftCount })}
              </AppText>
              <AppText variant="small" tone="brand" className="font-semibold">
                {t("resume")}
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
