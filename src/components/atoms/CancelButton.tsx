"use client";

import cancelEvent from "@/actions/cancelEvent";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useToast } from "@/hooks/useToast";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdOutlineCancel } from "react-icons/md";

type CancelProp = {
  eventId: string;
};

export default function CancelButton({ eventId }: CancelProp) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  const { mutate, isPending } = useMutation({
    mutationFn: () => cancelEvent(eventId),
    onSuccess: (response) => {
      if (response.status === 200) {
        setShowCancelConfirm(false);
        invalidateEventListQueries(queryClient);
        toast.success(response.message);
      } else {
        setError(
          response.message ?? "Failed updating event status. Please try again.",
        );
      }
    },
    onError: () => {
      setError("Something went wrong. Please try again.");
    },
  });

  return (
    <>
      <button
        onClick={() => {
          setError(null);
          setShowCancelConfirm(true);
        }}
        type="button"
        className="flex items-center gap-1 p-1 text-destructive"
      >
        <MdOutlineCancel className="text-xl " />
        Cancel Event
      </button>

      {showCancelConfirm && (
        <ConfirmDeleteModal
          title="Cancel this event?"
          message={error ?? "Are you sure you want to cancel this event?"}
          confirmLabel="Cancel Event"
          cancelLabel="Keep Event"
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  );
}
