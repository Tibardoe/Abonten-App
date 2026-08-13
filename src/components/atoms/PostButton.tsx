"use client";

import { isImageFile } from "@/utils/isImageFile";
import type React from "react";
import { useRef, useState } from "react";
import EventUploadMobileModal from "../organisms/EventUploadMobileModal";
import UploadEventModal from "../organisms/UploadEventModal";
import { Button } from "../ui/button";

export default function PostButton() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPostModal, setShowPostModal] = useState(false);

  const handlePostModal = (state: boolean) => {
    setShowPostModal(state);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!isImageFile(file)) {
      alert("Please select an image file for your event flyer.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setSelectedFile(file);
    setShowPostModal(true);
  };

  const closePopup = (state: boolean) => {
    setShowPostModal(state);
  };

  return (
    <>
      <Button
        className="px-10 hidden md:flex font-medium text-sm mt-5"
        onClick={() => handlePostModal(true)}
      >
        Post
      </Button>

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <Button
        className="font-medium px-10 md:hidden mt-5"
        onClick={() => fileInputRef.current?.click()}
      >
        Post
      </Button>

      {showPostModal && <UploadEventModal handleClosePopup={handlePostModal} />}

      {showPostModal && (
        <EventUploadMobileModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
        />
      )}
    </>
  );
}
