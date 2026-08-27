"use client";

import ModalShell from "@/components/atoms/ModalShell";
import { useCroppedImage } from "@/hooks/useCroppedImage";
import { useEventUploadForm } from "@/hooks/useEventUploadForm";
import { useImageSelection } from "@/hooks/useImageSelection";
import { useToast } from "@/hooks/useToast";
import type { EventDraftPayload } from "@/utils/eventDraftSchema";
import { invalidateEventListQueries } from "@/utils/mutationQueryInvalidation";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@/utils/uploadLimits";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import EventUploadFormFields from "../molecules/EventUploadFormFields";
import ImagePreviewPane from "../molecules/ImagePreviewPane";
import UploadStepHeader from "../molecules/UploadStepHeader";
import SaveDraftConfirmDialog from "./SaveDraftConfirmDialog";

// Dynamically imported so react-image-crop only loads once a user
// actually reaches the cropping step.
const ImageCropper = dynamic(() => import("./ImageCropper"), {
  ssr: false,
});

type EventUploadModalProps = {
  handleClosePopup: (state: boolean) => void;
  imgUrl: string;
  // Optional in continue-draft mode: a draft's flyer is already on
  // Cloudinary (see existingFlyer), so there's no local File until/unless
  // the user picks a replacement.
  selectedFile: File | null;
  onUploadSuccess?: () => void;
  // Continue-draft mode.
  draftId?: string;
  initialValues?: EventDraftPayload;
  initialUpdatedAt?: string;
  existingFlyer?: { public_id: string; version: string };
  // Fired after a successful "Save Draft & close" — distinct from
  // onUploadSuccess, which only fires when the event is actually published.
  onDraftSaved?: () => void;
  // Places feature Milestone 6: set when opened from a place's management
  // page ("+ Add Upcoming Event"), locking this event's venue to that
  // place — the owner still fills in everything else about the event
  // normally.
  preselectedPlaceId?: string;
  preselectedPlaceAddress?: string;
  preselectedPlaceName?: string;
};

// One responsive modal for event flyer upload, replacing the previous
// desktop-only UploadEventModal and mobile-only EventUploadMobileModal,
// which duplicated ~150 lines of validation/submit logic and ~180 lines of
// form JSX verbatim. The file itself is picked by the trigger before this
// modal ever mounts (previously true only for the mobile flow) — except in
// continue-draft mode, which opens the modal directly with the draft's
// already-uploaded flyer.
export default function EventUploadModal({
  handleClosePopup,
  imgUrl,
  selectedFile,
  onUploadSuccess,
  draftId,
  initialValues,
  initialUpdatedAt,
  existingFlyer,
  onDraftSaved,
  preselectedPlaceId,
  preselectedPlaceAddress,
  preselectedPlaceName,
}: EventUploadModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  // Skip straight to the details step only when continuing a draft that
  // already has an uploaded flyer (nothing to crop/pick) — a draft with no
  // image yet, or a brand-new event, still goes through the normal
  // pick/crop step first.
  const [step, setStep] = useState<1 | 2>(
    initialValues && existingFlyer ? 2 : 1,
  );
  const [showCrop, setShowCrop] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const {
    cropped,
    croppedPreview,
    handleCropped,
    reset: resetCrop,
  } = useCroppedImage({
    onCropped: () => {
      // Leave the crop tool and jump straight to the details step —
      // otherwise navigating Back later would silently reopen the cropper
      // instead of showing the (now-cropped) preview.
      setShowCrop(false);
      setStep(2);
    },
  });

  // A flyer picked to replace the original selection (or a draft's already
  // -uploaded flyer) — stays null until the user acts on the "Change Flyer"
  // button, so an untouched modal behaves exactly as before.
  const {
    imagePreview: replacementPreview,
    selectedFile: replacementFile,
    fileInputRef: replaceFileInputRef,
    openFilePicker: openReplaceFilePicker,
    handleFileChange: handleReplaceFileChange,
  } = useImageSelection({
    invalidFileMessage: "Please select an image file for your event flyer.",
    maxSizeBytes: MAX_EVENT_FLYER_SIZE_BYTES,
    onInvalidFile: (message) => toast.error(message),
    onSelect: () => {
      // The previous crop (if any) belonged to the old flyer — clear it so
      // the pending change is the new image, not a leftover crop of the one
      // being replaced.
      resetCrop();
      setStep(1);
      setShowCrop(false);
    },
  });

  // The flyer currently being worked with, before any crop is applied: the
  // original pick/draft flyer, or a replacement once one has been chosen.
  const sourceFile = replacementFile ?? selectedFile;
  const sourcePreview = replacementPreview ?? imgUrl;

  // What's actually shown and submitted: a crop result takes priority over
  // its (replacement or original) source image.
  const effectiveFile = cropped ?? sourceFile;
  const effectivePreview = croppedPreview ?? sourcePreview;

  const eventUploadForm = useEventUploadForm({
    file: effectiveFile,
    onSuccess: () => {
      router.refresh();
      invalidateEventListQueries(queryClient);
      handleClosePopup(false);
      onUploadSuccess?.();
    },
    draftId,
    initialValues,
    initialUpdatedAt,
    existingFlyer,
    preselectedPlaceId,
    preselectedPlaceAddress,
    preselectedPlaceName,
  });

  const {
    isUploading,
    isResolvingLocation,
    handleSubmit,
    onSubmit,
    hasMeaningfulContent,
    saveDraft,
    isSavingDraft,
  } = eventUploadForm;

  const uploadButtonLabel = isResolvingLocation
    ? "Resolving location..."
    : isUploading
      ? "Uploading..."
      : "Upload";

  const requestClose = () => {
    if (hasMeaningfulContent) {
      setShowCancelConfirm(true);
    } else {
      handleClosePopup(false);
    }
  };

  // Step 2's Back button steps back to the flyer preview/crop screen rather
  // than closing the whole modal -- otherwise there's no way back to it once
  // past step 1, e.g. to change or crop the flyer after already filling in
  // event details. Closing the modal entirely is still one Back tap away
  // from there, via step 1's own onBack (requestClose).
  const goBackToPreview = () => {
    setShowCrop(false);
    setStep(1);
  };

  const handleSaveDraftAndClose = async () => {
    const response = await saveDraft();
    setShowCancelConfirm(false);
    if (response.status === 200) {
      handleClosePopup(false);
      onDraftSaved?.();
    }
  };

  return (
    <>
      <ModalShell
        open
        onClose={requestClose}
        title="Create Event"
        className="bg-background md:bg-transparent"
      >
        <div className="flex flex-col h-full w-full md:h-[95%] md:w-[70%] md:rounded-2xl bg-background md:bg-card text-foreground md:text-card-foreground py-3 overflow-y-auto overflow-x-hidden">
          {step === 1 && (
            <div className="flex flex-col flex-1 min-h-0 w-full">
              {showCrop ? (
                <div className="relative flex flex-col items-center w-full md:w-[90%] flex-1 min-h-0 overflow-y-auto mx-auto">
                  <ImageCropper
                    imagePreview={sourcePreview}
                    handleCropped={handleCropped}
                    handleCancel={() => setShowCrop(false)}
                  />
                </div>
              ) : (
                <>
                  <UploadStepHeader
                    onBack={requestClose}
                    primaryAction={{
                      label: "Next",
                      onClick: () => setStep(2),
                      disabled: isUploading,
                    }}
                  />

                  <div className="relative flex-1 min-h-0 w-full md:w-[40%] mx-auto">
                    <ImagePreviewPane
                      src={effectivePreview}
                      alt="Selected flyer"
                      className="w-full h-full"
                      onCropToggle={() => setShowCrop(true)}
                    />
                    <button
                      type="button"
                      onClick={openReplaceFilePicker}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-full"
                    >
                      Change Flyer
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <>
              <UploadStepHeader
                onBack={goBackToPreview}
                title="Create Event"
                primaryAction={{
                  label: uploadButtonLabel,
                  onClick: handleSubmit(onSubmit),
                  disabled: isUploading,
                }}
              />

              <div className="flex flex-col md:flex-row w-full flex-1 min-h-0 md:h-[90%] gap-3 overflow-y-auto md:overflow-hidden">
                <div className="relative w-full md:w-1/2 aspect-square md:aspect-auto md:h-full mx-auto md:mx-0 md:rounded-bl-2xl overflow-hidden shrink-0">
                  <ImagePreviewPane
                    src={effectivePreview}
                    alt="Selected flyer"
                    className="w-full h-full"
                  />
                  <button
                    type="button"
                    onClick={openReplaceFilePicker}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-full"
                  >
                    Change Flyer
                  </button>
                </div>

                <EventUploadFormFields
                  {...eventUploadForm}
                  className="space-y-4 w-full md:w-1/2 md:h-full md:overflow-y-auto"
                />
              </div>
            </>
          )}
        </div>
      </ModalShell>

      <input
        type="file"
        accept="image/*"
        hidden
        ref={replaceFileInputRef}
        onChange={handleReplaceFileChange}
      />

      {showCancelConfirm && (
        <SaveDraftConfirmDialog
          message="You have unsaved changes to this event."
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
