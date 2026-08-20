"use client";

import { removePlacePhoto } from "@/actions/removePlacePhoto";
import { reorderPlacePhotos } from "@/actions/reorderPlacePhotos";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { usePlaceGalleryUpload } from "@/hooks/usePlaceGalleryUpload";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import Image from "next/image";
import { useRef, useState } from "react";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa";
import { IoCloudUploadOutline, IoTrashOutline } from "react-icons/io5";

type PlacePhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

type ManagePlacePhotosSectionProps = {
  placeId: string;
  photos: PlacePhoto[];
  onChanged: () => void;
};

// Multi-photo gallery: add via the direct-to-Cloudinary upload pipeline
// (usePlaceGalleryUpload.ts), remove, and reorder. Reordering uses simple
// left/right buttons rather than a drag-and-drop library -- no
// drag-and-drop dependency exists anywhere else in this codebase, and a
// small gallery (a handful of photos) doesn't need one.
export default function ManagePlacePhotosSection({
  placeId,
  photos,
  onChanged,
}: ManagePlacePhotosSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPendingRemoval, setPhotoPendingRemoval] = useState<string | null>(
    null,
  );
  const [isRemoving, setIsRemoving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  const { items, start, dismiss, isUploading } = usePlaceGalleryUpload(
    placeId,
    onChanged,
  );

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) start(files);
  };

  const handleConfirmRemove = async () => {
    if (!photoPendingRemoval) return;
    setIsRemoving(true);
    try {
      await removePlacePhoto(photoPendingRemoval);
      onChanged();
    } finally {
      setIsRemoving(false);
      setPhotoPendingRemoval(null);
    }
  };

  const movePhoto = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= photos.length) return;

    const reordered = [...photos];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setIsReordering(true);
    try {
      await reorderPlacePhotos(
        placeId,
        reordered.map((photo) => photo.id),
      );
      onChanged();
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleFilesSelected}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center gap-2 border border-dashed border-border rounded-lg px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-60"
      >
        <IoCloudUploadOutline className="text-lg" />
        Add photos
      </button>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 text-sm bg-muted rounded-md px-3 py-2"
            >
              <span className="truncate">{item.fileName}</span>
              <span className="shrink-0 text-muted-foreground">
                {item.status === "error"
                  ? (item.errorMessage ?? "Failed")
                  : item.status === "success"
                    ? "Done"
                    : `${item.progress}%`}
              </span>
              {item.status === "error" && (
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 text-destructive"
                >
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {photos.length === 0 ? (
        <p className="text-muted-foreground text-sm">No gallery photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <div key={photo.id} className="space-y-1">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                <Image
                  src={buildCloudinaryUrl(photo.public_id, photo.version, {
                    width: 300,
                    height: 300,
                  })}
                  alt="Place gallery photo"
                  fill
                  className="object-cover"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => movePhoto(index, -1)}
                    disabled={index === 0 || isReordering}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move earlier"
                  >
                    <FaArrowLeft />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePhoto(index, 1)}
                    disabled={index === photos.length - 1 || isReordering}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move later"
                  >
                    <FaArrowRight />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPhotoPendingRemoval(photo.id)}
                  className="p-1 text-destructive hover:text-destructive/80"
                  aria-label="Remove photo"
                >
                  <IoTrashOutline />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {photoPendingRemoval && (
        <ConfirmDeleteModal
          message="Remove this photo from your gallery? This can't be undone."
          isLoading={isRemoving}
          onConfirm={handleConfirmRemove}
          onCancel={() => setPhotoPendingRemoval(null)}
        />
      )}
    </div>
  );
}
