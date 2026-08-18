"use client";

import { deleteEvent } from "@/actions/deleteEvent";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdDeleteOutline } from "react-icons/md";
import Notification from "./Notification";

type EventProp = {
  eventId: string;
};

export default function DeleteEventButton({ eventId }: EventProp) {
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(3000);

  const { mutate, isPending } = useMutation({
    mutationFn: () => deleteEvent(eventId),
    onSuccess: (response) => {
      if (response.status === 200) {
        setShowDeletePopup(false);
        invalidateEventListQueries(queryClient);
        showMessage(response.message);
      } else {
        setError(response.message);
      }
    },
    onError: () => {
      setError("Something went wrong. Please try again.");
    },
  });

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1 text-destructive"
        onClick={() => {
          setError(null);
          setShowDeletePopup(true);
        }}
      >
        <MdDeleteOutline className="text-xl" />
        Delete Event
      </button>

      {showDeletePopup && (
        <ConfirmDeleteModal
          message={error ?? "Are you sure you want to delete this event?"}
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowDeletePopup(false)}
        />
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
