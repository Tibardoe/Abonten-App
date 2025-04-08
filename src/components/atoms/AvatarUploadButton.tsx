"use client";

import { useState } from "react";
import UploadAvatarModal from "../organisms/UploadAvatarModal";
import { Button } from "../ui/button";

export default function AvatarUploadButton() {
  const [showPopup, setShowPopup] = useState(false);

  const handlePopup = () => {
    setShowPopup(true);
  };

  const closePopup = (state: boolean) => {
    setShowPopup(state);
  };

  return (
    <>
      {showPopup && <UploadAvatarModal handleClosePopup={closePopup} />}

      <Button className="font-bold hidden md:flex" onClick={handlePopup}>
        Change Photo
      </Button>
    </>
  );
}
