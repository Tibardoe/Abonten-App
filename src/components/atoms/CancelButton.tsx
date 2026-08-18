"use client";

import cancelEvent from "@/actions/cancelEvent";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdOutlineCancel } from "react-icons/md";
import Notification from "./Notification";

type CancelProp = {
  eventId: string;
};

export default function CancelButton({ eventId }: CancelProp) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(3000);

  const { mutate, isPending } = useMutation({
    mutationFn: () => cancelEvent(eventId),
    onSuccess: (response) => {
      if (response.status === 200) {
        setShowCancelConfirm(false);
        invalidateEventListQueries(queryClient);
        showMessage(response.message);
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
          message={error ?? "Are you sure you want to cancel this event?"}
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
