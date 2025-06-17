"use client";

import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LiaTimesSolid } from "react-icons/lia";
import Notification from "../atoms/Notification";
import ImageCropper from "./ImageCropper";

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
  const [cropped, setCropped] = useState<File | null>(null);

  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  const [step, setStep] = useState(1);

  const router = useRouter();

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!cropped || !selectedFile) {
        setNotification("Please select a photo!");
        return;
      }

      if (cropped.size > 5 * 1024 * 1024) {
        setNotification("File is too large. Please upload an image under 5MB.");
        return;
      }

      try {
        await saveAvatarToCloudinary(cropped);
        setNotification("Upload successful!");
        handleClosePopup(false);
        router.refresh();
        return "success";
      } catch (error) {
        console.error("Error uploading image:", error);
        setNotification("Upload failed. Please try again.");
      }
    },
    onSettled: () => {
      setTimeout(() => {
        setNotification(null);
      }, 3000);
    },
  });

  // Cleanup croppedPreview URL when it changes or on unmount
  useEffect(() => {
    return () => {
      if (croppedPreview) URL.revokeObjectURL(croppedPreview);
    };
  }, [croppedPreview]);

  const handleCropped = (croppedFile: File) => {
    setCropped(croppedFile);
    const preview = URL.createObjectURL(croppedFile);
    setCroppedPreview(preview);
    setStep(2);
  };

  return (
    <>
      {step === 1 && (
        <div className="fixed top-0 left-0 z-30 w-full h-dvh bg-white flex flex-col items-center gap-5 md:hidden overflow-y-scroll">
          <div className="w-[90%] flex justify-between mt-5">
            <button type="button" onClick={() => handleClosePopup(false)}>
              <LiaTimesSolid className="text-2xl" />
            </button>

            <h1 className="font-bold text-lg mx-auto">New Post</h1>
          </div>

          {imgUrl && (
            <div className="w-[90%]">
              <ImageCropper
                imagePreview={imgUrl}
                handleCropped={handleCropped}
                handleCancel={() => {
                  handleClosePopup(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="fixed top-0 left-0 z-30 w-full h-dvh bg-white flex flex-col items-center gap-5 md:hidden">
          <div className="w-[90%] flex justify-between mt-5">
            <button type="button" onClick={() => handleClosePopup(false)}>
              <LiaTimesSolid className="text-2xl" />
            </button>

            <h1 className="font-bold text-lg">New Post</h1>

            <button
              type="button"
              className="font-bold"
              onClick={() => mutate()}
              disabled={isPending}
            >
              {isPending ? "Uploading..." : "Upload"}
            </button>
          </div>

          {croppedPreview && (
            <div className="w-[90%]">
              <Image
                src={croppedPreview}
                alt="Selected Avatar"
                width={200}
                height={200}
                className="w-full h-full"
              />
            </div>
          )}
        </div>
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
