"use client";

import { deleteEvent } from "@/actions/deleteEvent";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/useToast";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdDeleteOutline } from "react-icons/md";

type EventProp = {
  eventId: string;
  /** Renders as a DropdownMenuItem (event card menu) instead of a plain button. */
  asMenuItem?: boolean;
  /** Closes the parent dropdown once the confirm dialog is dismissed --
   * required when asMenuItem (see EventCardMenuBtn.tsx). */
  onRequestClose?: () => void;
};

export default function DeleteEventButton({
  eventId,
  asMenuItem,
  onRequestClose,
}: EventProp) {
  const [showDeletePopup, setShowDeletePopup] = useState(false);

  const queryClient = useQueryClient();
  const toast = useToast();

  const closePopup = () => {
    setShowDeletePopup(false);
    onRequestClose?.();
  };

  const { mutate } = useMutation({
    mutationFn: () => deleteEvent(eventId),

    // An event can appear in several differently-shaped lists at once
    // (organizer's own list, home/search feeds, favorites, profile posts —
    // see EVENT_LIST_KEY_PREFIXES) with no single safe way to splice it out
    // of all of them locally, so the list itself still waits for
    // invalidateEventListQueries' refetch rather than guessing. The dialog
    // closing immediately is what makes this feel instant.
    onMutate: () => {
      closePopup();
    },

    onSuccess: (response) => {
      if (response.status === 200) {
        invalidateEventListQueries(queryClient);
        toast.success(response.message);
      } else {
        toast.error(
          response.message ?? "Couldn't delete this event. Please try again.",
        );
      }
    },

    onError: () => {
      toast.error("Couldn't delete this event. Please try again.");
    },
  });

  return (
    <>
      {asMenuItem ? (
        <DropdownMenuItem
          onSelect={(event) => {
            // Keep the dropdown mounted -- otherwise Radix unmounts this
            // component (and the confirm-dialog state below) before the
            // dialog ever renders.
            event.preventDefault();
            setShowDeletePopup(true);
          }}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <MdDeleteOutline className="text-xl" />
          Delete Event
        </DropdownMenuItem>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1 p-1 text-destructive"
          onClick={() => setShowDeletePopup(true)}
        >
          <MdDeleteOutline className="text-xl" />
          Delete Event
        </button>
      )}

      {showDeletePopup && (
        <ConfirmDeleteModal
          title="Delete this event?"
          message="This will permanently remove the event and its listing. This cannot be undone."
          confirmLabel="Delete Event"
          loadingLabel="Deleting…"
          isLoading={false}
          onConfirm={() => mutate()}
          onCancel={closePopup}
        />
      )}
    </>
  );
}
