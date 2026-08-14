"use client";

import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCroppedImage } from "@/hooks/useCroppedImage";
import { useState } from "react";
import Notification from "../atoms/Notification";
import ImagePreviewPane from "../molecules/ImagePreviewPane";
import UploadStepHeader from "../molecules/UploadStepHeader";
import ImageCropper from "./ImageCropper";

type AvatarUploadModalProps = {
  handleClosePopup: (state: boolean) => void;
  imgUrl: string;
};

// One responsive modal for avatar upload, replacing the previous
// desktop-only UploadAvatarModal and mobile-only MobileUploadModal, which
// duplicated the same crop -> preview -> upload flow and upload mutation.
// The file itself is picked by the trigger before this modal ever mounts.
export default function AvatarUploadModal({
  handleClosePopup,
  imgUrl,
}: AvatarUploadModalProps) {
  useBodyScrollLock(true);

  const [step, setStep] = useState<1 | 2>(1);

  const { cropped, croppedPreview, handleCropped } = useCroppedImage({
    onCropped: () => setStep(2),
  });

  const { uploadAvatar, isUploading, notification } = useAvatarUpload({
    onSuccess: () => handleClosePopup(false),
  });

  return (
    <>
      <div className="fixed inset-0 z-30 bg-background md:bg-overlay/50 md:flex md:items-center md:justify-center">
        <div className="flex flex-col h-full w-full md:h-[85%] md:w-[45%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground py-3 overflow-y-auto">
          {step === 1 && (
            <ImageCropper
              imagePreview={imgUrl}
              handleCropped={handleCropped}
              handleCancel={() => handleClosePopup(false)}
            />
          )}

          {step === 2 && croppedPreview && (
            <>
              <UploadStepHeader
                onBack={() => setStep(1)}
                title="Upload Avatar"
                primaryAction={{
                  label: isUploading ? "Uploading..." : "Upload",
                  onClick: () => uploadAvatar(cropped),
                  disabled: isUploading,
                }}
              />

              <div className="flex flex-col items-center mt-5 w-[90%] mx-auto">
                <div className="relative w-full max-w-sm aspect-square">
                  <ImagePreviewPane
                    src={croppedPreview}
                    alt="Selected Avatar"
                    className="w-full h-full"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {notification && <Notification notification={notification} />}
    </>
  );
}
