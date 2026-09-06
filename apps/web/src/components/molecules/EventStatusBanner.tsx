"use client";

import { resolveOccurrenceState } from "@abonten/core/eventPurchaseEligibility";
import type { Occurrence } from "@abonten/types/occurrenceType";
import { useEffect, useState } from "react";

// Above-the-fold "canceled / ended / in progress" banner on the event
// detail page. A client component (not computed in the server page) so a
// tab left open across an occurrence's end time re-evaluates on the same
// 30s cadence EventDateSelector uses — otherwise the banner would stay
// wrong until a manual reload while the CTA below already updated.
export default function EventStatusBanner({
  eventDates,
  eventStatus,
}: {
  eventDates: Occurrence[];
  eventStatus: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const isCanceled = eventStatus === "canceled";
  const state = resolveOccurrenceState(undefined, undefined, eventDates);

  const message = isCanceled
    ? "This event has been canceled."
    : state.blockReason === "ended"
      ? "This event has ended."
      : state.blockReason === "ongoing_no_future"
        ? "This event is currently in progress."
        : null;

  if (!message) return null;

  return (
    <div className="max-w-7xl mx-auto px-2 lg:px-8 pt-6">
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm md:text-base font-medium text-destructive text-center">
        {message}
      </div>
    </div>
  );
}
