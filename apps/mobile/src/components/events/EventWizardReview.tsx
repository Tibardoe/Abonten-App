import type { EventWizard } from "@/features/events/useEventWizard";
import { prettyDate } from "@/lib/datetime";
import { AppText } from "@abonten/ui-native";
import { Image } from "expo-image";
import { View } from "react-native";

// Step 7 of the event wizard — a last look before publishing. Mirrors the
// web review/publish step. Publish is the header's "Publish" button
// (app/(app)/event/new.tsx).
export function EventWizardReview({ w }: { w: EventWizard }) {
  const when =
    w.scheduleMode === "single"
      ? w.rangeStart
        ? `${prettyDate(w.rangeStart)} ${w.rangeStartTime} – ${
            w.rangeEnd ? prettyDate(w.rangeEnd) : ""
          } ${w.rangeEndTime}`.trim()
        : "—"
      : `${w.occurrences.length} date${w.occurrences.length === 1 ? "" : "s"}`;

  const ticketing =
    w.ticketMode === "free"
      ? "Free"
      : w.ticketMode === "single"
        ? `${w.currency} ${w.ticketPrice || "0"}${
            w.ticketQuantity ? ` · ${w.ticketQuantity} available` : ""
          }`
        : `${w.tiers.length} ticket type${w.tiers.length === 1 ? "" : "s"}`;

  return (
    <View className="gap-4">
      {w.flyerUri ? (
        <Image
          source={{ uri: w.flyerUri }}
          style={{ width: "100%", aspectRatio: 4 / 5, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : null}

      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Row label="Title" value={w.title} />
        <Row label="Category" value={w.category ?? "—"} />
        <Row label="Types" value={w.types.join(", ")} />
        <Row label="When" value={when} />
        <Row label="Location" value={w.address} />
        {w.capacity ? <Row label="Capacity" value={w.capacity} /> : null}
        <Row label="Ticketing" value={ticketing} />
        {w.promos.length > 0 ? (
          <Row label="Promo codes" value={String(w.promos.length)} />
        ) : null}
        <Row
          label="Registration"
          value={w.requireRegistration ? "Required" : "Not required"}
        />
      </View>

      <AppText className="text-[13px] text-muted-foreground">
        {w.description}
      </AppText>

      {w.isSubmitError ? (
        <AppText className="text-[13px] text-destructive">
          We couldn't post your event. Please try again.
        </AppText>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <AppText className="text-[13px] text-muted-foreground">{label}</AppText>
      <AppText className="flex-1 text-right text-[13px] text-foreground">
        {value || "—"}
      </AppText>
    </View>
  );
}
