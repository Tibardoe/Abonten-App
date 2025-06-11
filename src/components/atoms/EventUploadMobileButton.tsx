"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import EventUploadMobileModal from "../organisms/EventUploadMobileModal";
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

    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setSelectedFile(file);
      setShowPopup(true);
    }
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
        accept="image/*, video/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <button
        type="button"
        className="flex gap-1 items-center"
        onClick={() => fileInputRef.current?.click()}
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
