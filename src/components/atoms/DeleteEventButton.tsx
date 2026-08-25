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

  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(3000);

  const { mutate } = useMutation({
    mutationFn: () => deleteEvent(eventId),

    // An event can appear in several differently-shaped lists at once
    // (organizer's own list, home/search feeds, favorites, profile posts —
    // see EVENT_LIST_KEY_PREFIXES) with no single safe way to splice it out
    // of all of them locally, so the list itself still waits for
    // invalidateEventListQueries' refetch rather than guessing. The dialog
    // closing immediately is what makes this feel instant.
    onMutate: () => {
      setShowDeletePopup(false);
    },

    onSuccess: (response) => {
      if (response.status === 200) {
        invalidateEventListQueries(queryClient);
        showMessage(response.message);
      } else {
        showMessage(response.message ?? "Couldn't delete this event.");
      }
    },

    onError: () => {
      showMessage("Something went wrong. Please try again.");
    },
  });

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1 text-destructive"
        onClick={() => setShowDeletePopup(true)}
      >
        <MdDeleteOutline className="text-xl" />
        Delete Event
      </button>

      {showDeletePopup && (
        <ConfirmDeleteModal
          message="Are you sure you want to delete this event?"
          isLoading={false}
          onConfirm={() => mutate()}
          onCancel={() => setShowDeletePopup(false)}
        />
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
