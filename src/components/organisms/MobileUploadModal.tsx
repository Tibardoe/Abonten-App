"use client";

import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LiaTimesSolid } from "react-icons/lia";
import Notification from "../atoms/Notification";

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
  // const [isUploading, setIsUploading] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  const router = useRouter();

  // const handleUpload = async () => {
  //   if (!selectedFile) {
  //     alert("Please select a file first!");
  //     return;
  //   }

  //   setIsUploading(true);

  //   try {
  //     await saveAvatarToCloudinary(selectedFile);
  //     alert("Upload successful!");
  //     handleClosePopup(false);
  //   } catch (error) {
  //     console.error("Error uploading image:", error);
  //     alert("Upload failed. Please try again.");
  //   } finally {
  //     setIsUploading(false);
  //   }
  // };

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        setNotification("Please select a photo!");
        return;
      }

      if (selectedFile.size > 5 * 1024 * 1024) {
        setNotification("File is too large. Please upload an image under 5MB.");
        return;
      }

      try {
        await saveAvatarToCloudinary(selectedFile);
        setNotification("Upload successful!");
        handleClosePopup(false);
        router.refresh();
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

  return (
    <>
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

        {imgUrl && (
          <div className="w-[90%]">
            <div className="w-[70%] mx-auto">
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

      {notification && <Notification notification={notification} />}
    </>
  );
}
