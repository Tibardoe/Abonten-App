"use client";

import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCroppedImage } from "@/hooks/useCroppedImage";
import { useEventUploadForm } from "@/hooks/useEventUploadForm";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Notification from "../atoms/Notification";
import EventUploadFormFields from "../molecules/EventUploadFormFields";
import ImagePreviewPane from "../molecules/ImagePreviewPane";
import UploadStepHeader from "../molecules/UploadStepHeader";

// Dynamically imported so react-image-crop only loads once a user
// actually reaches the cropping step.
const ImageCropper = dynamic(() => import("./ImageCropper"), {
  ssr: false,
});

type EventUploadModalProps = {
  handleClosePopup: (state: boolean) => void;
  imgUrl: string;
  selectedFile: File;
  onUploadSuccess?: () => void;
};

// One responsive modal for event flyer upload, replacing the previous
// desktop-only UploadEventModal and mobile-only EventUploadMobileModal,
// which duplicated ~150 lines of validation/submit logic and ~180 lines of
// form JSX verbatim. The file itself is picked by the trigger before this
// modal ever mounts (previously true only for the mobile flow).
export default function EventUploadModal({
  handleClosePopup,
  imgUrl,
  selectedFile,
  onUploadSuccess,
}: EventUploadModalProps) {
  useBodyScrollLock(true);

  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [showCrop, setShowCrop] = useState(false);

  const { cropped, croppedPreview, handleCropped } = useCroppedImage({
    onCropped: () => {
      // Leave the crop tool and jump straight to the details step —
      // otherwise navigating Back later would silently reopen the cropper
      // instead of showing the (now-cropped) preview.
      setShowCrop(false);
      setStep(2);
    },
  });

  const eventUploadForm = useEventUploadForm({
    file: cropped ?? selectedFile,
    onSuccess: () => {
      router.refresh();
      handleClosePopup(false);
      onUploadSuccess?.();
    },
  });

  const { notification, isUploading, handleSubmit, onSubmit } = eventUploadForm;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-background md:bg-overlay/50 md:flex md:items-center md:justify-center">
        <div className="flex flex-col h-full w-full md:h-[95%] md:w-[70%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground py-3 overflow-y-auto">
          {step === 1 && (
            <div className="flex flex-col flex-1 min-h-0 w-full">
              {showCrop ? (
                <div className="relative flex flex-col items-center w-full md:w-[90%] flex-1 min-h-0 overflow-y-auto mx-auto">
                  <ImageCropper
                    imagePreview={imgUrl}
                    handleCropped={handleCropped}
                    handleCancel={() => setShowCrop(false)}
                  />
                </div>
              ) : (
                <>
                  <UploadStepHeader
                    onBack={() => handleClosePopup(false)}
                    primaryAction={{
                      label: "Next",
                      onClick: () => setStep(2),
                      disabled: isUploading,
                    }}
                  />

                  <div className="relative flex-1 min-h-0 w-full md:w-[40%] mx-auto">
                    <ImagePreviewPane
                      src={croppedPreview ?? imgUrl}
                      alt="Selected flyer"
                      className="w-full h-full"
                      onCropToggle={() => setShowCrop(true)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <>
              <UploadStepHeader
                onBack={() => setStep(1)}
                title="Create new post"
                primaryAction={{
                  label: isUploading ? "Uploading..." : "Upload",
                  onClick: handleSubmit(onSubmit),
                  disabled: isUploading,
                }}
              />

              <div className="flex flex-col md:flex-row w-full flex-1 min-h-0 md:h-[90%] gap-3 overflow-y-auto md:overflow-hidden">
                <div className="relative w-full md:w-1/2 aspect-square md:aspect-auto md:h-full mx-auto md:mx-0 md:rounded-bl-2xl overflow-hidden shrink-0">
                  <ImagePreviewPane
                    src={croppedPreview ?? imgUrl}
                    alt="Selected flyer"
                    className="w-full h-full"
                  />
                </div>

                <EventUploadFormFields
                  {...eventUploadForm}
                  className="space-y-4 w-full md:w-1/2 md:h-full md:overflow-y-auto"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <Notification notification={notification} />
    </>
  );
}
