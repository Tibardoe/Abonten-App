"use client";

import React, { useState } from "react";
import EventUploadMobileModal from "../organisms/EventUploadMobileModal";
import UploadEventModal from "../organisms/UploadEventModal";
import { Button } from "../ui/button";

export default function PostButton() {
  const [showPostModal, setShowPostModal] = useState(false);

  const handlePostModal = (state: boolean) => {
    setShowPostModal(state);
  };
  return (
    <>
      <Button
        className="font-bold md:text-lg px-10"
        onClick={() => handlePostModal(true)}
      >
        Post
      </Button>

      {showPostModal && <UploadEventModal handleClosePopup={handlePostModal} />}
    </>
  );
}
