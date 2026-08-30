"use client";

import ModalShell from "@/components/atoms/ModalShell";
import UploadStepHeader from "@/components/molecules/UploadStepHeader";
import SaveDraftConfirmDialog from "@/components/organisms/SaveDraftConfirmDialog";
import { useCroppedImage } from "@/hooks/useCroppedImage";
import { useImageSelection } from "@/hooks/useImageSelection";
import { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
import { invalidatePlaceListQueries } from "@/utils/mutationQueryInvalidation";
import type { PlaceDraftPayload } from "@/utils/placeDraftSchema";
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
  // Continue-draft mode.
  draftId?: string;
  initialValues?: PlaceDraftPayload;
  initialUpdatedAt?: string;
  existingCoverPhoto?: { public_id: string; version: string };
  existingCoverPreviewUrl?: string;
  // Fired on every successful "Save as Draft," separately from
  // onUploadSuccess, which only fires when the place is actually published.
  onDraftSaved?: () => void;
};

type Step = 1 | 2 | 3 | 4;

// Modal shell for the Place creation flow (Places feature Milestone 3).
// Four steps rather than events' two: Basic Info, Photos, Hours, then a
// Review/Publish step giving the owner one last look before publishing.
// Unlike EventUploadModal, there's no pre-modal file picker — the cover
// photo (step 2) is picked from inside this modal, since Places has no
// equivalent of the flyer-first flow. Cancel offers save-as-draft/discard
// (SaveDraftConfirmDialog) from Step 1's back button, same as
// EventUploadModal — steps 2-4's back buttons just navigate to the
// previous step and don't need this.
export default function PlaceUploadModal({
  handleClosePopup,
  onUploadSuccess,
  draftId,
  initialValues,
  initialUpdatedAt,
  existingCoverPhoto,
  existingCoverPreviewUrl,
  onDraftSaved,
}: PlaceUploadModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [showCrop, setShowCrop] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
    draftId,
    initialValues,
    initialUpdatedAt,
    existingCoverPhoto,
  });

  const {
    isUploading,
    isResolvingLocation,
    handleSubmit,
    onSubmit,
    resolveLocation,
    hasMeaningfulContent,
    saveDraft,
    isSavingDraft,
  } = placeUploadForm;

  const publishButtonLabel = isResolvingLocation
    ? "Resolving location..."
    : isUploading
      ? "Publishing..."
      : "Publish";

  const basicInfoNextLabel = isResolvingLocation
    ? "Resolving location..."
    : "Next";

  // The address field only exists while this step is mounted -- resolve it
  // now, before advancing, rather than at final Publish (step 4), where
  // PostAutoComplete has already unmounted and can no longer resolve
  // anything typed here.
  const handleBasicInfoNext = async () => {
    const resolved = await resolveLocation();
    if (resolved) setStep(2);
  };

  const requestClose = () => {
    if (hasMeaningfulContent) {
      setShowCancelConfirm(true);
    } else {
      handleClosePopup(false);
    }
  };

  const handleSaveDraftAndClose = async () => {
    const response = await saveDraft();
    setShowCancelConfirm(false);
    if (response.status === 200) {
      handleClosePopup(false);
      onDraftSaved?.();
    }
  };

  const coverPreview =
    croppedPreview ?? imagePreview ?? existingCoverPreviewUrl ?? null;

  return (
    <>
      <ModalShell
        open
        onClose={requestClose}
        title="Create Place"
        className="bg-background md:bg-transparent"
      >
        {/* Matches EventUploadModal: px-4 gutters on mobile so nothing
            touches the screen edge, md:px-0 for the flush desktop panel. */}
        <div className="flex flex-col h-full w-full md:h-[95%] md:w-[70%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground px-4 py-3 md:px-0 overflow-y-auto">
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
                  label: basicInfoNextLabel,
                  onClick: handleBasicInfoNext,
                  disabled: isUploading || isResolvingLocation,
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
                  label: publishButtonLabel,
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
      </ModalShell>

      {showCancelConfirm && (
        <SaveDraftConfirmDialog
          message="You have unsaved changes to this place."
          isSaving={isSavingDraft}
          onSaveDraft={handleSaveDraftAndClose}
          onDiscard={() => {
            setShowCancelConfirm(false);
            handleClosePopup(false);
          }}
          onContinueEditing={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  );
}
