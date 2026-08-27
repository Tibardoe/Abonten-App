"use client";

import { submitPlaceClaimRequest } from "@/actions/submitPlaceClaimRequest";
import ModalShell from "@/components/atoms/ModalShell";
import { useToast } from "@/hooks/useToast";
import { useState } from "react";

type ClaimPlaceModalProps = {
  placeId: string;
  placeName: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

/**
 * "Claim this Place" form -- reuses this codebase's existing fixed-overlay
 * modal convention (ReviewModal.tsx / ConfirmDeleteModal.tsx), not a new
 * Dialog primitive. Submits via submitPlaceClaimRequest.ts, which only ever
 * creates a pending place_claim_request row -- ownership never changes
 * here, only an admin approval does that (reviewPlaceClaimRequest.ts /
 * approve_place_claim RPC).
 */
export default function ClaimPlaceModal({
  placeId,
  placeName,
  onClose,
  onSubmitted,
}: ClaimPlaceModalProps) {
  const toast = useToast();

  const [note, setNote] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await submitPlaceClaimRequest({
        placeId,
        note: note.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
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
    <ModalShell open onClose={onClose} title={`Claim ${placeName}`}>
      <div className="w-full self-end md:self-center h-fit p-4 md:w-[70%] lg:w-[40%] bg-card text-card-foreground md:p-4 rounded-lg space-y-5">
        <div className="flex justify-between items-center gap-3">
          <h1 className="text-xl font-bold">Claim {placeName}</h1>
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
              Your claim request has been submitted. An admin will review it
              soon.
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
              Tell us why you're the rightful owner of this place. An admin will
              review your request before ownership changes.
            </p>

            <textarea
              rows={4}
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            <input
              type="tel"
              placeholder="Contact phone (optional)"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            <input
              type="email"
              placeholder="Contact email (optional)"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit Claim"}
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
