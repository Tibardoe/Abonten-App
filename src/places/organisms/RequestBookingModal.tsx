"use client";

import { requestPlaceBooking } from "@/actions/requestPlaceBooking";
import ModalShell from "@/components/atoms/ModalShell";
import { useToast } from "@/hooks/useToast";
import { useState } from "react";

type BookingService = {
  id: string;
  name: string;
};

type RequestBookingModalProps = {
  placeId: string;
  placeName: string;
  services: BookingService[];
  onClose: () => void;
  onSubmitted?: () => void;
};

/**
 * "Book" request form -- reservation REQUEST only, per the confirmed
 * milestone scope: no payment/checkout here, just a pending place_booking
 * row the owner later accepts or declines off-platform money, if any,
 * changes hands separately. Reuses this codebase's existing fixed-overlay
 * modal convention (ClaimPlaceModal.tsx / ReviewModal.tsx) rather than a
 * new Dialog primitive, and a plain controlled form -- RHF is overkill for
 * four fields, per the milestone spec -- same as ClaimPlaceModal.tsx.
 */
export default function RequestBookingModal({
  placeId,
  placeName,
  services,
  onClose,
  onSubmitted,
}: RequestBookingModalProps) {
  const toast = useToast();

  const [serviceId, setServiceId] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [partySize, setPartySize] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // <input type="datetime-local"> has no timezone info, so this is only an
  // approximate floor (a minute from "now" in whatever timezone the browser
  // is in) -- the real future-time validation happens against the parsed
  // Date both here on submit and again server-side in
  // requestPlaceBooking.ts, which is the actual source of truth.
  const minDateTime = new Date(Date.now() + 60 * 1000)
    .toISOString()
    .slice(0, 16);

  const handleSubmit = async () => {
    if (!requestedTime) {
      toast.error("Please choose a date and time.");
      return;
    }

    const parsedTime = new Date(requestedTime);
    if (
      Number.isNaN(parsedTime.getTime()) ||
      parsedTime.getTime() <= Date.now()
    ) {
      toast.error("Please choose a time in the future.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await requestPlaceBooking({
        placeId,
        serviceId: serviceId || undefined,
        requestedTime: parsedTime.toISOString(),
        partySize: partySize ? Number(partySize) : undefined,
        note: note.trim() || undefined,
      });

      if (response.status === 200) {
        setSubmitted(true);
        onSubmitted?.();
      } else {
        toast.error(`❌ ${response.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell open onClose={onClose} title={`Book ${placeName}`}>
      <div className="w-full self-end md:self-center h-fit p-4 md:w-[70%] lg:w-[40%] bg-card text-card-foreground md:p-4 rounded-lg space-y-5">
        <div className="flex justify-between items-center gap-3">
          <h1 className="text-xl font-bold">Book {placeName}</h1>
          <button
            type="button"
            onClick={onClose}
            className="font-bold text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Your booking request has been sent. The owner will accept or
              decline it soon.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This is a request only -- payment, if any, is arranged directly
              with the owner.
            </p>

            {services.length > 0 && (
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-md border border-input bg-background p-2 text-sm"
              >
                <option value="">No specific service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="datetime-local"
              value={requestedTime}
              min={minDateTime}
              onChange={(e) => setRequestedTime(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            <input
              type="number"
              min={1}
              placeholder="Party size (optional)"
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            <textarea
              rows={3}
              placeholder="Note for the owner (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? "Sending..." : "Request Booking"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 border border-border py-2 rounded-md text-sm hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
