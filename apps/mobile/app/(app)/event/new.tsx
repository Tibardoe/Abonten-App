import { StepDots } from "@/components/StepDots";
import { EventWizardBasics } from "@/components/events/EventWizardBasics";
import { EventWizardFlyer } from "@/components/events/EventWizardFlyer";
import { EventWizardLocation } from "@/components/events/EventWizardLocation";
import { EventWizardPromos } from "@/components/events/EventWizardPromos";
import { EventWizardReview } from "@/components/events/EventWizardReview";
import { EventWizardSchedule } from "@/components/events/EventWizardSchedule";
import { EventWizardTickets } from "@/components/events/EventWizardTickets";
import { useEventDrafts } from "@/features/events/useEventDrafts";
import { useEventWizard } from "@/features/events/useEventWizard";
import {
  Link,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useEffect } from "react";
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

const STEP_TITLES = [
  "Create event · Basics",
  "Create event · Flyer",
  "Create event · Schedule",
  "Create event · Location",
  "Create event · Tickets",
  "Create event · Promo codes",
  "Create event · Review",
];

export default function CreateEventScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const w = useEventWizard(draftId);
  const draftsList = useEventDrafts();
  const draftCount =
    draftsList.data?.status === 200 ? draftsList.data.data.length : 0;

  useEffect(() => {
    navigation.setOptions({ title: STEP_TITLES[w.step] });
  }, [navigation, w.step]);

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

  async function onSaveDraft() {
    const res = await w.saveDraft();
    if (res.status === 200) {
      Alert.alert("Draft saved", "Pick it back up any time from Event drafts.");
    } else {
      Alert.alert("Couldn't save draft", res.message ?? "Please try again.");
    }
  }

  if (w.isHydratingDraft) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
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

      {w.step === 0 ? (
        <EventWizardBasics
          w={w}
          onNext={() => {
            if (w.validateBasics()) w.setStep(1);
          }}
        />
      ) : null}

      {w.step === 1 ? (
        <EventWizardFlyer
          w={w}
          onBack={() => w.setStep(0)}
          onNext={() => w.setStep(2)}
        />
      ) : null}

      {w.step === 2 ? (
        <EventWizardSchedule
          w={w}
          onBack={() => w.setStep(1)}
          onNext={() => w.setStep(3)}
        />
      ) : null}

      {w.step === 3 ? (
        <EventWizardLocation
          w={w}
          onBack={() => w.setStep(2)}
          onNext={() => w.setStep(4)}
        />
      ) : null}

      {w.step === 4 ? (
        <EventWizardTickets
          w={w}
          onBack={() => w.setStep(3)}
          onNext={() => w.setStep(5)}
        />
      ) : null}

      {w.step === 5 ? (
        <EventWizardPromos
          w={w}
          onBack={() => w.setStep(4)}
          onNext={() => w.setStep(6)}
        />
      ) : null}

      {w.step === 6 ? (
        <EventWizardReview
          w={w}
          onBack={() => w.setStep(5)}
          onPublish={onPublish}
        />
      ) : null}
    </ScrollView>
  );
}
