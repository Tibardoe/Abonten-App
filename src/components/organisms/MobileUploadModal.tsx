"use client";

import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import Image from "next/image";
import { useState } from "react";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
  imgUrl: string | null;
  selectedFile: File | null;
};

export default function MobileUploadModal({
  handleClosePopup,
  imgUrl,
  selectedFile,
}: closePopupModalType) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setIsUploading(true);

    try {
      await saveAvatarToCloudinary(selectedFile);
      alert("Upload successful!");
      handleClosePopup(false);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed top-0 left-0 z-10 w-full h-dvh bg-white flex flex-col items-center gap-5 md:hidden">
      <div className="w-[90%] flex justify-between mt-5">
        <button type="button" onClick={() => handleClosePopup(false)}>
          <Image
            src="/assets/images/cancel.svg"
            alt="Cancel"
            width={15}
            height={15}
          />
        </button>

        <h1 className="font-bold text-lg">New Post</h1>

        <button
          type="button"
          className="font-bold"
          onClick={handleUpload}
          disabled={isUploading}
        >
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {imgUrl && (
        <div className="w-[90%]">
          <div className="w-full">
            <Image
              src={imgUrl}
              alt="Selected Avatar"
              width={200}
              height={200}
              className="w-full h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
