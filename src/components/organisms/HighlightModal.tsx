import MediaStage from "@/components/molecules/MediaStage";
import VideoTrimEditor from "@/components/molecules/VideoTrimEditor";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useMediaSelection } from "@/hooks/useMediaSelection";
import type { MediaItem } from "@/types/mediaItemType";
import formatDuration from "@/utils/formatVideoDuration";
import {
  ChevronLeftIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CiCrop } from "react-icons/ci";
import { MdOutlineCancel } from "react-icons/md";
import ThumbnailStrip from "../molecules/ThumbnailStrip";
import { Button } from "../ui/button";

// Dynamically imported so react-image-crop only loads once a user
// actually reaches the cropping step.
const ImageCropper = dynamic(() => import("./ImageCropper"), {
  ssr: false,
});

type ClosePopupModalType = {
  handleShowHighlightModal: (state: boolean) => void;
  onUpload: (mediaItems: MediaItem[]) => void;
};

export default function HighlightModal({
  handleShowHighlightModal,
  onUpload,
}: ClosePopupModalType) {
  useBodyScrollLock(true);

  const {
    mediaItems,
    activeId,
    direction,
    currentIndex,
    currentMedia,
    timelineStatus,
    selectFiles,
    deleteMedia,
    replaceCropped,
    updateTrim,
    ensureTimelineThumbnails,
    goToOffset,
    goToId,
  } = useMediaSelection();

  const [isCropping, setIsCropping] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  // Whether the currently-displayed item's actual preview (not just its
  // object URL) has rendered a frame -- gates the Upload button so it can't
  // be pressed while the preview still looks blank/frozen.
  const [isPreviewReady, setIsPreviewReady] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Returning to the gallery step once the last item is removed, rather
  // than closing the whole modal, so the user can pick again without
  // starting the flow over.
  useEffect(() => {
    if (step === 2 && mediaItems.length === 0) {
      setStep(1);
    }
  }, [step, mediaItems.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally resets whenever the active item changes
  useEffect(() => {
    setIsPlaying(false);
    setIsPreviewReady(false);
  }, [currentMedia?.id]);

  useEffect(() => {
    if (currentMedia?.type === "video") {
      ensureTimelineThumbnails(currentMedia.id);
    }
  }, [currentMedia?.id, currentMedia?.type, ensureTimelineThumbnails]);

  // Re-subscribed only when the active item (and so the underlying <video>
  // element, which is remounted per slide) changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on currentMedia?.id only, videoRef is a stable ref
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [currentMedia?.id]);

  const togglePlayPause = () => {
    if (videoRef.current && currentMedia?.type === "video") {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        if (
          videoRef.current.currentTime < (currentMedia.startTime || 0) ||
          videoRef.current.currentTime >=
            (currentMedia.endTime || videoRef.current.duration)
        ) {
          videoRef.current.currentTime = currentMedia.startTime || 0;
        }
        videoRef.current.play();
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    if (videoRef.current && currentMedia?.type === "video") {
      videoRef.current.currentTime = currentMedia.startTime ?? 0;
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const accepted = await selectFiles(files);
    if (accepted) {
      setStep(2);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteMedia = (id: string) => {
    if (id === currentMedia?.id) {
      videoRef.current?.pause();
      setIsPlaying(false);
    }
    deleteMedia(id);
  };

  const handleCropped = (croppedFile: File) => {
    if (!currentMedia || currentMedia.type !== "image") {
      setIsCropping(false);
      setImageToCrop(null);
      return;
    }

    replaceCropped(currentMedia.id, croppedFile);
    setIsCropping(false);
    setImageToCrop(null);
  };

  const handleCancelCrop = () => {
    setIsCropping(false);
    setImageToCrop(null);

    if (mediaItems.length === 0) {
      setStep(1);
    }
  };

  const handleCancelOrBack = () => {
    if (isCropping) {
      handleCancelCrop();
    } else if (step === 1) {
      handleShowHighlightModal(false);
    } else {
      setStep(step - 1);
    }
  };

  // Hands the media off to the parent and closes immediately -- the user
  // shouldn't have to sit on this screen waiting for the upload/processing
  // to finish. The parent (which outlives this modal) performs the actual
  // upload and reports success/failure once it's done.
  const handleHighlightUpload = () => {
    onUpload(mediaItems);
    handleShowHighlightModal(false);
  };

  const renderMediaItem = (item: MediaItem) => {
    if (item.type === "image") {
      return (
        <div className="relative w-full h-screen">
          <Image
            src={item.url}
            alt="Selected media"
            fill
            className="object-contain"
            unoptimized
            onLoad={() => setIsPreviewReady(true)}
          />
        </div>
      );
    }

    return (
      <div className="relative flex items-center justify-center w-full">
        <video
          ref={videoRef}
          src={item.url}
          className="max-w-full max-h-full"
          onClick={togglePlayPause}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              togglePlayPause();
            }
          }}
          tabIndex={0}
          onEnded={handleVideoEnded}
          muted={isMuted}
          playsInline
          webkit-playsinline="true"
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = item.startTime ?? 0;
            setIsPreviewReady(true);
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? "Pause video" : "Play video"}
            className="p-4 bg-black bg-opacity-50 rounded-full"
          >
            {isPlaying ? (
              <PauseIcon className="w-10 h-10 text-white" />
            ) : (
              <PlayIcon className="w-10 h-10 text-white" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="w-full flex justify-between items-center p-4 absolute top-0 z-10">
        <button
          type="button"
          onClick={handleCancelOrBack}
          aria-label={step === 1 && !isCropping ? "Close" : "Back"}
          className="text-white p-2 rounded-full backdrop-blur-md border border-white/20 bg-black bg-opacity-75"
        >
          {step === 1 && !isCropping ? (
            <MdOutlineCancel className="w-6 h-6" />
          ) : (
            <ChevronLeftIcon className="w-6 h-6" />
          )}
        </button>

        {step === 1 && (
          <h2 className="text-white font-medium text-lg backdrop-blur-md border border-white/20 bg-black bg-opacity-75 p-2 rounded-md">
            New Highlight
          </h2>
        )}

        {!isCropping && step === 2 && currentMedia && (
          <div className="flex items-center gap-2">
            {currentMedia.type === "image" && (
              <button
                type="button"
                onClick={() => {
                  setImageToCrop(currentMedia.url);
                  setIsCropping(true);
                }}
                aria-label="Crop image"
                className="backdrop-blur-md border border-white/20 bg-black bg-opacity-75 p-2 rounded-full"
              >
                <CiCrop className="w-5 h-5 text-white" />
              </button>
            )}

            <button
              type="button"
              onClick={handleHighlightUpload}
              disabled={!isPreviewReady}
              className={`text-white font-medium backdrop-blur-md bg-mint p-2 rounded-md ${
                isPreviewReady ? "" : "opacity-50 cursor-not-allowed"
              }`}
            >
              Upload
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        <div className="w-full h-full flex flex-col items-center justify-center relative">
          {isCropping && imageToCrop ? (
            <div className="w-full h-full md:h-[80%] md:w-[50%] bg-background text-foreground flex flex-col overflow-y-auto pt-2 md:pt-0 z-20">
              <ImageCropper
                imagePreview={imageToCrop}
                handleCropped={handleCropped}
                handleCancel={handleCancelCrop}
              />
            </div>
          ) : step === 1 ? (
            <div className="flex flex-col items-center gap-8 p-6 text-center">
              <div className="bg-iconGray p-6 rounded-full">
                <Image
                  src="/assets/images/gallery.svg"
                  alt="Gallery"
                  width={60}
                  height={60}
                  className="filter invert"
                />
              </div>
              <h3 className="text-white md:text-xl font-medium">
                Upload highlights here
              </h3>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <Button
                className="px-8 py-6 md:text-lg rounded-md bg-mint font-medium hover:bg-white hover:bg-opacity-50"
                onClick={() => fileInputRef.current?.click()}
              >
                Select from Gallery
              </Button>
            </div>
          ) : step === 2 && currentMedia ? (
            <div className="w-full h-full flex items-center justify-center relative">
              {currentMedia.type === "video" && (
                <div className="absolute self-start w-full md:w-[50%] space-y-2 mt-20 z-20">
                  <VideoTrimEditor
                    videoRef={videoRef}
                    mediaItem={currentMedia}
                    timelineStatus={timelineStatus[currentMedia.id] ?? "idle"}
                    onTrimChange={(startTime, endTime) =>
                      updateTrim(currentMedia.id, startTime, endTime)
                    }
                  />

                  <div className="flex items-center px-2 gap-2">
                    <button
                      type="button"
                      onClick={toggleMute}
                      aria-label={isMuted ? "Unmute video" : "Mute video"}
                      className="bg-black bg-opacity-50 p-2 rounded-full"
                    >
                      {isMuted ? (
                        <VolumeXIcon className="w-5 h-5 text-white" />
                      ) : (
                        <Volume2Icon className="w-5 h-5 text-white" />
                      )}
                    </button>

                    <div className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                      {formatDuration(
                        (currentMedia.endTime ?? 0) -
                          (currentMedia.startTime ?? 0),
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!isPreviewReady && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="border-4 border-white border-t-transparent animate-spin rounded-full w-12 h-12" />
                </div>
              )}

              <MediaStage
                activeItem={currentMedia}
                direction={direction}
                currentIndex={currentIndex}
                mediaItemsLength={mediaItems.length}
                onNavigate={goToOffset}
                renderItem={renderMediaItem}
              />
            </div>
          ) : null}

          {!isCropping && !imageToCrop && mediaItems.length > 0 && (
            <ThumbnailStrip
              mediaItems={mediaItems}
              activeId={activeId}
              onSelect={goToId}
              onDelete={handleDeleteMedia}
            />
          )}
        </div>
      </div>
    </div>
  );
}
