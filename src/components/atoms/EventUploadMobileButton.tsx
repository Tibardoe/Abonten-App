"use client";

import { isImageFile } from "@/utils/isImageFile";
import { useRef, useState } from "react";
import EventUploadMobileModal from "../organisms/EventUploadMobileModal";
import MaskIcon from "./MaskIcon";
// import { Button } from "../ui/button";

export default function MobileUploadButton() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [showPopup, setShowPopup] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // const handlePopup = () => {
  //   setShowPopup(true);
  // };

  const closePopup = (state: boolean) => {
    setShowPopup(state);
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
    setShowPopup(true);
  };

  return (
    <>
      {showPopup && (
        <EventUploadMobileModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
        />
      )}

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <button
        type="button"
        className="flex gap-1 items-center"
        onClick={() => fileInputRef.current?.click()}
      >
        <MaskIcon
          src="/assets/images/post.svg"
          alt="Post"
          className="w-[30px] h-[30px]"
        />
        Post
      </button>
    </>
  );
}
