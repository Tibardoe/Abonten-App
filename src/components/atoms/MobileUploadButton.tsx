"use client";

import { isImageFile } from "@/utils/isImageFile";
import { useRef, useState } from "react";
import MobileUploadModal from "../organisms/MobileUploadModal";
import { Button } from "../ui/button";

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
      alert("Please select an image file for your profile picture.");
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
        <MobileUploadModal
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

      <Button
        className="font-bold bg-mint flex md:hidden"
        onClick={() => fileInputRef.current?.click()}
      >
        Change Photo
      </Button>
    </>
  );
}
