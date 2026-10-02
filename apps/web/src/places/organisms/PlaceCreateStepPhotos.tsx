import ImagePreviewPane from "@/components/molecules/ImagePreviewPane";
import { useTranslations } from "next-intl";

type PlaceCreateStepPhotosProps = {
  coverPreview: string | null;
  onPickPhoto: () => void;
  onCropToggle: () => void;
};

// Step 2 of the Place creation flow: pick + optionally crop a cover photo.
// Unlike EventUploadModal, where the flyer is picked before the modal ever
// mounts, a place has no pre-modal file picker — this step owns both the
// empty ("pick a photo") state and the preview/crop state.
export default function PlaceCreateStepPhotos({
  coverPreview,
  onPickPhoto,
  onCropToggle,
}: PlaceCreateStepPhotosProps) {
  const t = useTranslations("places");

  if (!coverPreview) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <button
          type="button"
          onClick={onPickPhoto}
          className="border border-dashed border-border rounded-lg px-8 py-12 text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          {t("tapToSelectACoverPhoto")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 w-full md:w-[40%] mx-auto">
      <ImagePreviewPane
        src={coverPreview}
        alt={t("placeCoverPhoto")}
        className="w-full h-full"
        onCropToggle={onCropToggle}
      />

      <button
        type="button"
        onClick={onPickPhoto}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-full"
      >
        {t("chooseADifferentPhoto")}
      </button>
    </div>
  );
}
