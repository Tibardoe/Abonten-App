import { StepDots } from "@/components/StepDots";
import { AppHeader } from "@/components/app/AppHeader";
import { EventWizardBasics } from "@/components/events/EventWizardBasics";
import { EventWizardFlyer } from "@/components/events/EventWizardFlyer";
import { EventWizardLocation } from "@/components/events/EventWizardLocation";
import { EventWizardPromos } from "@/components/events/EventWizardPromos";
import { EventWizardReview } from "@/components/events/EventWizardReview";
import { EventWizardSchedule } from "@/components/events/EventWizardSchedule";
import { EventWizardTickets } from "@/components/events/EventWizardTickets";
import { useEventDrafts } from "@/features/events/useEventDrafts";
import { useEventWizard } from "@/features/events/useEventWizard";
import { AppText, Hero, Overline } from "@abonten/ui-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";

// Native echo of the web EventUploadModal / useEventUploadForm — a 7-step
// wizard that publishes an event via useEventCreate. With `?draftId=`, it
// resumes a saved draft; the "Save as draft" button writes the same
// drafts/event_drafts rows the web saveEventDraft action does.
//
// Flyer comes first (a strong image is what sells an event), then the
// details in the order an organiser thinks about them: what it is → when →
// where → tickets → promos → review. Navigation lives in the header: Back
// steps back (or leaves the flow from step 0), Next / Publish advances; the
// per-step gates come from `w.canAdvance`, except Basics which validates on
// Next-press.

const STEPS: { title: string; subtitle: string }[] = [
  {
    title: "Event flyer",
    subtitle: "A striking image is what sells the event — add it first.",
  },
  {
    title: "Basic info",
    subtitle: "Name, description, category and capacity.",
  },
  { title: "Date & time", subtitle: "When the event happens." },
  { title: "Location", subtitle: "Where guests should go." },
  {
    title: "Tickets & pricing",
    subtitle: "Free entry, one price, or multiple tiers.",
  },
  { title: "Promo codes", subtitle: "Optional discount codes." },
  { title: "Review & publish", subtitle: "Check everything, then go live." },
];
const LAST_STEP = STEPS.length - 1;
const BASICS_STEP = 1;

export default function CreateEventScreen() {
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const w = useEventWizard(draftId);
  const draftsList = useEventDrafts();
  const draftCount =
    draftsList.data?.status === 200 ? draftsList.data.data.length : 0;

  async function onPublish() {
    const res = await w.submit();
    if (!res) return;

    if (res.status === 200 && "eventId" in res) {
      Alert.alert("Event published", "Your event is now live.", [
        {
          text: "View it",
          onPress: () => router.replace(`/(app)/event/${res.eventId}`),
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
      Alert.alert("Draft saved", "Pick it back up any time from Event drafts.");
    } else {
      Alert.alert("Couldn't save draft", res.message ?? "Please try again.");
    }
  }

  const header = (
    <AppHeader
      variant="form"
      title="Create Event"
      onBack={goBack}
      onNext={goNext}
      nextLabel={w.step === LAST_STEP ? "Publish" : "Next"}
      nextDisabled={w.isSubmitting || (w.step !== BASICS_STEP && !w.canAdvance)}
    />
  );

  if (w.isHydratingDraft) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
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
        <View className="gap-3.5">
          <View className="flex-row items-center justify-between">
            <StepDots step={w.step} total={STEPS.length} />
            <Pressable
              onPress={onSaveDraft}
              disabled={w.isSavingDraft}
              hitSlop={8}
              className="active:opacity-60 disabled:opacity-50"
            >
              <AppText className="text-[13px] font-semibold text-primary">
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

        {w.draftLoadError ? (
          <AppText className="text-[13px] text-destructive">
            {w.draftLoadError}
          </AppText>
        ) : null}

        {!draftId && draftCount > 0 && w.step === 0 ? (
          <Link href="/(app)/organizer/event-drafts" asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-[14px] text-foreground">
                You have {draftCount} saved draft{draftCount === 1 ? "" : "s"}
              </AppText>
              <AppText className="text-[14px] font-semibold text-primary">
                Resume ›
              </AppText>
            </Pressable>
          </Link>
        ) : null}

        {w.step === 0 ? <EventWizardFlyer w={w} /> : null}
        {w.step === 1 ? <EventWizardBasics w={w} /> : null}
        {w.step === 2 ? <EventWizardSchedule w={w} /> : null}
        {w.step === 3 ? <EventWizardLocation w={w} /> : null}
        {w.step === 4 ? <EventWizardTickets w={w} /> : null}
        {w.step === 5 ? <EventWizardPromos w={w} /> : null}
        {w.step === 6 ? <EventWizardReview w={w} /> : null}
      </ScrollView>
    </View>
  );
}
