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
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

// Native echo of the web EventUploadModal / useEventUploadForm — a 7-step
// wizard (Basics, Flyer, Schedule, Location, Tickets, Promo codes, Review)
// that publishes an event via useEventCreate. With `?draftId=`, it resumes
// a saved draft; the "Save as draft" button (WP-4g-2) writes the same
// drafts/event_drafts rows the web saveEventDraft action does.
//
// Navigation lives entirely in the header: Back steps back (or leaves the
// flow from step 0), Next / Publish advances. The per-step gates come from
// `w.canAdvance`.

const LAST_STEP = 6;

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
    if (w.step === 0) {
      if (w.validateBasics()) w.setStep(1);
      return;
    }
    if (w.step === LAST_STEP) {
      onPublish();
      return;
    }
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
      nextDisabled={w.isSubmitting || (w.step !== 0 && !w.canAdvance)}
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

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <StepDots step={w.step} total={7} />
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
          <Link href="/(app)/organizer/event-drafts" asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <Text className="text-sm text-foreground">
                You have {draftCount} saved draft{draftCount === 1 ? "" : "s"}
              </Text>
              <Text className="text-primary">Resume ›</Text>
            </Pressable>
          </Link>
        ) : null}

        {w.step === 0 ? <EventWizardBasics w={w} /> : null}
        {w.step === 1 ? <EventWizardFlyer w={w} /> : null}
        {w.step === 2 ? <EventWizardSchedule w={w} /> : null}
        {w.step === 3 ? <EventWizardLocation w={w} /> : null}
        {w.step === 4 ? <EventWizardTickets w={w} /> : null}
        {w.step === 5 ? <EventWizardPromos w={w} /> : null}
        {w.step === 6 ? <EventWizardReview w={w} /> : null}
      </ScrollView>
    </View>
  );
}
