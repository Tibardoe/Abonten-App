"use client";

import Notification from "@/components/atoms/Notification";
import UploadStepHeader from "@/components/molecules/UploadStepHeader";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCroppedImage } from "@/hooks/useCroppedImage";
import { useImageSelection } from "@/hooks/useImageSelection";
import { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
import { invalidatePlaceListQueries } from "@/utils/mutationQueryInvalidation";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@/utils/uploadLimits";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PlaceCreateStepBasicInfo from "./PlaceCreateStepBasicInfo";
import PlaceCreateStepHours from "./PlaceCreateStepHours";
import PlaceCreateStepPhotos from "./PlaceCreateStepPhotos";
import PlaceCreateStepReview from "./PlaceCreateStepReview";

// Dynamically imported so react-image-crop only loads once an owner
// actually reaches the cropping step, same as EventUploadModal.tsx.
const ImageCropper = dynamic(
  () => import("@/components/organisms/ImageCropper"),
  { ssr: false },
);

type PlaceUploadModalProps = {
  handleClosePopup: (state: boolean) => void;
  onUploadSuccess?: () => void;
};

type Step = 1 | 2 | 3 | 4;

// Modal shell for the Place creation flow (Places feature Milestone 3).
// Four steps rather than events' two: Basic Info, Photos, Hours, then a
// Review/Publish step giving the owner one last look before publishing —
// there's no draft-save safety net for Places in Phase 1, so this final
// confirmation is deliberate. Unlike EventUploadModal, there's no
// pre-modal file picker — the cover photo (step 2) is picked from inside
// this modal, since Places has no equivalent of the flyer-first flow.
// Cancel just closes the modal (no SaveDraftConfirmDialog equivalent),
// also deliberate — Place creation is meant to stay short.
export default function PlaceUploadModal({
  handleClosePopup,
  onUploadSuccess,
}: PlaceUploadModalProps) {
  useBodyScrollLock(true);

  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [showCrop, setShowCrop] = useState(false);

  const {
    imagePreview,
    selectedFile,
    fileInputRef,
    openFilePicker,
    handleFileChange,
  } = useImageSelection({
    invalidFileMessage: "Please select an image file for your cover photo.",
    maxSizeBytes: MAX_EVENT_FLYER_SIZE_BYTES,
    onInvalidFile: (message) => alert(message),
  });

  const { cropped, croppedPreview, handleCropped } = useCroppedImage({
    onCropped: () => setShowCrop(false),
  });

  const placeUploadForm = usePlaceUploadForm({
    file: cropped ?? selectedFile,
    onSuccess: () => {
      router.refresh();
      invalidatePlaceListQueries(queryClient);
      handleClosePopup(false);
      onUploadSuccess?.();
    },
  });

  const { notification, isUploading, handleSubmit, onSubmit } = placeUploadForm;

  const requestClose = () => handleClosePopup(false);

  const coverPreview = croppedPreview ?? imagePreview;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-background md:bg-overlay/50 md:flex md:items-center md:justify-center">
        <div className="flex flex-col h-full w-full md:h-[95%] md:w-[70%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground py-3 overflow-y-auto">
          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          {step === 1 && (
            <>
              <UploadStepHeader
                onBack={requestClose}
                title="New Place · Basic Info"
                primaryAction={{
                  label: "Next",
                  onClick: () => setStep(2),
                  disabled: isUploading,
                }}
              />
              <PlaceCreateStepBasicInfo
                {...placeUploadForm}
                className="space-y-4 w-full md:w-[60%] mx-auto py-5 overflow-y-auto"
              />
            </>
          )}

          {step === 2 && (
            <div className="flex flex-col flex-1 min-h-0 w-full">
              {showCrop && imagePreview ? (
                <div className="relative flex flex-col items-center w-full md:w-[90%] flex-1 min-h-0 overflow-y-auto mx-auto">
                  <ImageCropper
                    imagePreview={imagePreview}
                    handleCropped={handleCropped}
                    handleCancel={() => setShowCrop(false)}
                  />
                </div>
              ) : (
                <>
                  <UploadStepHeader
                    onBack={() => setStep(1)}
                    title="New Place · Cover Photo"
                    primaryAction={{
                      label: "Next",
                      onClick: () => setStep(3),
                      disabled: isUploading || !coverPreview,
                    }}
                  />
                  <PlaceCreateStepPhotos
                    coverPreview={coverPreview}
                    onPickPhoto={openFilePicker}
                    onCropToggle={() => setShowCrop(true)}
                  />
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <>
              <UploadStepHeader
                onBack={() => setStep(2)}
                title="New Place · Hours"
                primaryAction={{
                  label: "Next",
                  onClick: () => setStep(4),
                  disabled: isUploading,
                }}
              />
              <PlaceCreateStepHours
                {...placeUploadForm}
                className="space-y-4 w-full md:w-[60%] mx-auto py-5 overflow-y-auto"
              />
            </>
          )}

          {step === 4 && (
            <>
              <UploadStepHeader
                onBack={() => setStep(3)}
                title="New Place · Review"
                primaryAction={{
                  label: isUploading ? "Publishing..." : "Publish",
                  onClick: handleSubmit(onSubmit),
                  disabled: isUploading,
                }}
              />
              <PlaceCreateStepReview
                {...placeUploadForm}
                coverPreview={coverPreview}
                className="space-y-4 w-full md:w-[60%] mx-auto py-5 overflow-y-auto"
              />
            </>
          )}
        </div>
      </div>

      <Notification notification={notification} />
    </>
  );
}
