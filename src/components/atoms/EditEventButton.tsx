"use client";

import EditEventModal from "@/components/organisms/EditEventModal";
import { useState } from "react";
import { MdOutlineEdit } from "react-icons/md";

type EventProp = {
  eventId: string;
};

export default function EditEventButton({ eventId }: EventProp) {
  const [showEditModal, setShowEditModal] = useState(false);

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1"
        onClick={() => setShowEditModal(true)}
      >
        <MdOutlineEdit className="text-xl" />
        Edit Event
      </button>

      {showEditModal && (
        <EditEventModal eventId={eventId} handleClosePopup={setShowEditModal} />
      )}
    </>
  );
}
