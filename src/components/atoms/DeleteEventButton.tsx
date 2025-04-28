import { useState } from "react";
import { MdDeleteOutline } from "react-icons/md";
import DeletePopupModal from "../organisms/DeletePopupModal";

type EventProp = {
  eventId: string;
};

export default function DeleteEventButton({ eventId }: EventProp) {
  const [showDeletePopup, setShowDeletePopup] = useState(false);

  const handleShowDeletePopup = (state: boolean) => {
    setShowDeletePopup(state);
  };

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1 text-red-800"
        onClick={() => handleShowDeletePopup(true)}
      >
        <MdDeleteOutline className="text-xl" />
        Delete Event
      </button>

      {showDeletePopup && (
        <DeletePopupModal
          eventId={eventId}
          handleShowDeletePopup={handleShowDeletePopup}
          message="Are you sure you want to delete this event?"
        />
      )}
    </>
  );
}
