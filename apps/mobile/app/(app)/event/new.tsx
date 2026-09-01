import { StepDots } from "@/components/StepDots";
import { EventWizardBasics } from "@/components/events/EventWizardBasics";
import { EventWizardFlyer } from "@/components/events/EventWizardFlyer";
import { EventWizardLocation } from "@/components/events/EventWizardLocation";
import { EventWizardPromos } from "@/components/events/EventWizardPromos";
import { EventWizardReview } from "@/components/events/EventWizardReview";
import { EventWizardSchedule } from "@/components/events/EventWizardSchedule";
import { EventWizardTickets } from "@/components/events/EventWizardTickets";
import { useEventWizard } from "@/features/events/useEventWizard";
import { useNavigation, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, ScrollView } from "react-native";

// Native echo of the web EventUploadModal / useEventUploadForm — a 7-step
// wizard (Basics, Flyer, Schedule, Location, Tickets, Promo codes, Review)
// that publishes an event via useEventCreate (signed Cloudinary upload +
// POST /api/mobile/events → the same postEventCore the web postEvent action
// runs). All state/logic live in useEventWizard; this file is the step
// switch + navigation. Save-as-draft (WP-4g) and the optional Abonten-Place
// venue picker are deferred.

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
  const w = useEventWizard();

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

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <StepDots step={w.step} total={7} />

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
