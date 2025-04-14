"use client";

import Image from "next/image";
import { useState } from "react";
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
        <Image
          src="/assets/images/post.svg"
          alt="Post"
          width={30}
          height={30}
        />
        Post
      </button>
    </>
  );
}
