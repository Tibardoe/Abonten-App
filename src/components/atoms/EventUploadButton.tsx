"use client";

import { useState } from "react";
import { IoCreateOutline } from "react-icons/io5";
import UploadEventModal from "../organisms/UploadEventModal";

export default function EventUploadButton() {
  const [showPopup, setShowPopup] = useState(false);

  const handlePopup = () => {
    setShowPopup(true);
  };

  const closePopup = (state: boolean) => {
    setShowPopup(state);
  };

  return (
    <>
      {showPopup && <UploadEventModal handleClosePopup={closePopup} />}

      <button
        type="button"
        className="flex gap-1 items-center"
        onClick={handlePopup}
      >
        <IoCreateOutline className="text-3xl" />
        Post
      </button>
    </>
  );
}
