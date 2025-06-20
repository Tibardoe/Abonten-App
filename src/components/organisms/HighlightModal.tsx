import type { MediaItem } from "@/types/mediaItemType";
import formatDuration from "@/utils/formatVideoDuration";
import { generateVideoThumbnail } from "@/utils/generateVideoThumbnail";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { MdOutlineCancel } from "react-icons/md";
import ThumbnailStrip from "../molecules/ThumbnailStrip";
import { Button } from "../ui/button";
import ImageCropper from "./ImageCropper";

type ClosePopupModalType = {
  handleShowHighlightModal: (state: boolean) => void;
};

export default function HighlightModal({
  handleShowHighlightModal,
}: ClosePopupModalType) {
  const [isCropping, setIsCropping] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [step, setStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<
    "start" | "end" | "middle" | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackEditorRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const dragOffset = useRef(0);

  const currentMedia = mediaItems[currentIndex];
  const maxVideoUploadDuration = 60; // Max allowed duration for uploaded videos (1 minute)
  const maxTrimSegmentDuration = 60; // Max duration of the *trimmed segment* (1 minute)

  // Handle swipe gestures for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const threshold = 50;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) < threshold) return;

    if (diff > threshold) {
      handleNext();
    } else if (diff < -threshold) {
      handlePrevious();
    }
  };

  // Video controls
  const togglePlayPause = () => {
    if (videoRef.current && currentMedia?.type === "video") {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // Ensure playback starts from the trimmed start time
        if (
          videoRef.current.currentTime < (currentMedia.startTime || 0) ||
          videoRef.current.currentTime >=
            (currentMedia.endTime || videoRef.current.duration)
        ) {
          videoRef.current.currentTime = currentMedia.startTime || 0;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
    // Reset to start time if video ends within its trimmed range
    if (
      videoRef.current &&
      currentMedia?.type === "video" &&
      currentMedia.startTime !== undefined
    ) {
      videoRef.current.currentTime = currentMedia.startTime;
    } else if (currentIndex < mediaItems.length - 1) {
      // Otherwise, move to the next item
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
      }, 500);
    }
  };

  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.src = url;

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.src = ""; // Release video resource
      };

      video.onloadedmetadata = () => {
        resolve(video.duration);
        cleanup();
      };

      video.onerror = () => {
        console.error("Error loading video metadata for:", url);
        cleanup();
        reject(new Error("Failed to load video metadata."));
      };
      // For some browsers, play() might be needed to load metadata immediately
      // video.play().catch(() => {}); // Play and catch error if not allowed
    });
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newMediaItems: MediaItem[] = [];
    const filesToProcess = Array.from(files);

    // Revoke old URLs from previous mediaItems before setting new ones
    // Only revoke if we are replacing all media (e.g., going from empty to having media)
    if (mediaItems.length > 0) {
      for (const item of mediaItems) {
        URL.revokeObjectURL(item.url);
      }
    }

    for (const file of filesToProcess) {
      const url = URL.createObjectURL(file);

      if (file.type.startsWith("video")) {
        let duration = 0;

        // let thumbnail = "";

        try {
          duration = await getVideoDuration(url);

          if (Number.isNaN(duration)) {
            throw new Error("Invalid video duration");
          }

          // thumbnail = await generateVideoThumbnail(file);
        } catch (e) {
          console.error("Skipping video due to metadata error:", file.name, e);
          URL.revokeObjectURL(url); // Clean up the URL if metadata failed
          continue; // Skip to next file
        }

        // Enforce 1-minute upload limit here
        if (duration > maxVideoUploadDuration) {
          alert(
            `Video "${file.name}" is longer than ${maxVideoUploadDuration} seconds and will be trimmed to the first ${maxVideoUploadDuration} seconds.`,
          );
          // Automatically trim to the first 1 minute if it's too long
          newMediaItems.push({
            url,
            file,
            type: "video",
            duration, // Keep original duration for reference
            startTime: 0,
            endTime: maxVideoUploadDuration, // Cap at maxVideoUploadDuration
            // thumbnail,
          });
        } else {
          newMediaItems.push({
            url,
            file,
            type: "video",
            duration,
            startTime: 0,
            endTime: duration, // Full duration if within limit
            // thumbnail,
          });
        }
      } else {
        newMediaItems.push({ url, file, type: "image" });
      }
    }

    if (newMediaItems.length > 0) {
      setMediaItems(newMediaItems);
      setCurrentIndex(0); // Reset to first item
      setStep(2);
    }
    // Clear the file input to allow selecting the same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Navigation functions
  const handleNext = () => {
    if (currentIndex < mediaItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlaying(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(false);
    }
  };

  // Delete media item
  const handleDelete = (index: number) => {
    // Revoke URL of the item being deleted to free up memory
    if (mediaItems[index]) {
      URL.revokeObjectURL(mediaItems[index].url);
    }

    if (mediaItems.length === 1) {
      handleShowHighlightModal(false); // Close modal if last item deleted
      return;
    }

    const updated = mediaItems.filter((_, i) => i !== index);

    setMediaItems(updated);

    // Adjust currentIndex if necessary
    const newIndex =
      index === currentIndex && index === mediaItems.length - 1
        ? currentIndex - 1
        : currentIndex > index
          ? currentIndex - 1
          : currentIndex;

    setCurrentIndex(newIndex);
    setIsPlaying(false);
  };

  const handleTrackEditorClick = (e: React.MouseEvent) => {
    if (
      !trackEditorRef.current ||
      !currentMedia ||
      currentMedia.type !== "video" ||
      !videoRef.current
    )
      return;

    const rect = trackEditorRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const percentage = clickPosition / rect.width;
    const totalVideoDuration = currentMedia.duration || 0;
    const seekTime = percentage * totalVideoDuration;

    videoRef.current.currentTime = Math.min(seekTime, totalVideoDuration);
  };

  const handleDragStart = (
    handleType: "start" | "end" | "middle",
    e: React.MouseEvent,
  ) => {
    if (
      !currentMedia ||
      currentMedia.type !== "video" ||
      !trackEditorRef.current
    )
      return;

    setIsDragging(true);
    setDragHandle(handleType);

    if (handleType === "middle") {
      const rect = trackEditorRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const startPixel =
        (trimStart / (currentMedia.duration || 1)) * rect.width;
      dragOffset.current = clickX - startPixel; // Offset from click to the start of the selection
    }
  };

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (
        !isDragging ||
        !trackEditorRef.current ||
        !currentMedia ||
        currentMedia.type !== "video" ||
        currentMedia.duration === undefined ||
        currentMedia.duration === 0
      )
        return;

      const rect = trackEditorRef.current.getBoundingClientRect();
      const newPositionX = Math.min(
        Math.max(e.clientX - rect.left, 0),
        rect.width,
      );
      const totalVideoDuration = currentMedia.duration;
      const minTrimDuration = 0.1; // Minimum duration for the trimmed segment

      if (dragHandle === "start") {
        let newStart = (newPositionX / rect.width) * totalVideoDuration;
        // Ensure newStart is within bounds and doesn't make segment too small
        newStart = Math.max(0, Math.min(newStart, trimEnd - minTrimDuration));
        setTrimStart(newStart);

        // Adjust trimEnd if current selection length exceeds maxTrimSegmentDuration
        if (trimEnd - newStart > maxTrimSegmentDuration) {
          setTrimEnd(newStart + maxTrimSegmentDuration);
        }

        if (videoRef.current) {
          videoRef.current.currentTime = newStart;
        }
      } else if (dragHandle === "end") {
        let newEnd = (newPositionX / rect.width) * totalVideoDuration;
        // Ensure newEnd is within bounds and doesn't make segment too small
        newEnd = Math.min(newEnd, totalVideoDuration);
        newEnd = Math.max(newEnd, trimStart + minTrimDuration); // End cannot be before start + min duration
        setTrimEnd(newEnd);

        // Adjust trimStart if current selection length exceeds maxTrimSegmentDuration
        if (newEnd - trimStart > maxTrimSegmentDuration) {
          setTrimStart(newEnd - maxTrimSegmentDuration);
        }

        if (videoRef.current) {
          videoRef.current.currentTime = newEnd;
        }
      } else if (dragHandle === "middle") {
        const currentSelectionLength = trimEnd - trimStart;
        const newStartPixel = newPositionX - dragOffset.current;
        let potentialNewStart =
          (newStartPixel / rect.width) * totalVideoDuration;

        // Clamp potentialNewStart to prevent selection going below 0
        potentialNewStart = Math.max(0, potentialNewStart);

        let potentialNewEnd = potentialNewStart + currentSelectionLength;

        // Clamp potentialNewEnd to prevent selection going beyond totalVideoDuration
        if (potentialNewEnd > totalVideoDuration) {
          potentialNewEnd = totalVideoDuration;
          potentialNewStart = potentialNewEnd - currentSelectionLength; // Adjust start to maintain length
          potentialNewStart = Math.max(0, potentialNewStart); // Re-clamp start
        }

        setTrimStart(potentialNewStart);
        setTrimEnd(potentialNewEnd);

        if (videoRef.current) {
          videoRef.current.currentTime = potentialNewStart;
        }
      }
    },
    [isDragging, dragHandle, trimStart, trimEnd, currentMedia],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
    dragOffset.current = 0;

    if (videoRef.current) {
      videoRef.current.currentTime = trimStart;
      videoRef.current.pause();
    }
  }, [trimStart]);

  const handleCropped = (croppedFile: File) => {
    const updatedMediaItems = [...mediaItems];
    // Ensure currentMedia exists and is an image before proceeding
    if (!currentMedia || currentMedia.type !== "image") {
      console.error(
        "Attempted to crop a non-image media item or currentMedia is null.",
      );
      setIsCropping(false);
      setImageToCrop(null);
      return;
    }

    const oldUrlToRevoke = updatedMediaItems[currentIndex].url; // Get the old URL before updating

    const newUrl = URL.createObjectURL(croppedFile);

    // Update the mediaItems array with the new URL and file
    updatedMediaItems[currentIndex] = {
      ...updatedMediaItems[currentIndex], // Keep original properties
      url: newUrl,
      file: croppedFile,
      type: "image", // Ensure type remains image
    };

    setMediaItems(updatedMediaItems);

    // Revoke the URL of the *old* image that was replaced
    URL.revokeObjectURL(oldUrlToRevoke);

    setIsCropping(false);
    setImageToCrop(null); // Clear image to crop
  };

  const handleCancelCrop = () => {
    // No URL revocation here as the original image's URL in mediaItems is still valid.
    setIsCropping(false);
    setImageToCrop(null); // Clear the image to crop state

    // If no media items were loaded before, go back to step 1
    if (mediaItems.length === 0) {
      setStep(1);
    }
  };

  const mediaItemsRef = useRef<MediaItem[]>([]);

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      for (const item of mediaItemsRef.current) {
        try {
          URL.revokeObjectURL(item.url);
        } catch (e) {
          console.warn("Error revoking URL:", item.url, e);
        }
      }
    };
  }, []);

  // Effect to manage current media item when currentIndex changes
  useEffect(() => {
    setIsPlaying(false);

    if (videoRef.current && currentMedia?.type === "video") {
      videoRef.current.currentTime = currentMedia.startTime || 0;
      videoRef.current.load();

      // Add this to ensure the new video is ready
      const handleCanPlay = () => {
        videoRef.current?.removeEventListener("canplay", handleCanPlay);
      };
      videoRef.current.addEventListener("canplay", handleCanPlay);
    }
  }, [currentMedia]);

  // Initialize trim values when video changes or trimmer opens
  useEffect(() => {
    if (currentMedia?.type === "video") {
      setTrimStart(currentMedia.startTime || 0);
      setTrimEnd(
        Math.min(
          currentMedia.endTime || currentMedia.duration || 0,
          currentMedia.duration || maxTrimSegmentDuration, // Ensure end doesn't exceed actual duration if it's shorter than maxTrimSegmentDuration
        ),
      );
      if (videoRef.current) {
        videoRef.current.currentTime = currentMedia.startTime || 0;
      }
    }
  }, [currentMedia]);

  // Add event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleDragMove);
        window.removeEventListener("mouseup", handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Effect to handle video playback within trim range for main video
  useEffect(() => {
    if (!videoRef.current || !currentMedia) return;

    const video = videoRef.current;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [currentMedia]);

  // Effect to handle video playback within trim range for trimmer video
  useEffect(() => {
    const updateTrimmerPlayhead = () => {
      if (videoRef.current) {
        // If playing and goes past end trim, loop back to start trim
        if (
          !videoRef.current.paused &&
          videoRef.current.currentTime >= trimEnd
        ) {
          videoRef.current.currentTime = trimStart;
        }
      }
    };
    const interval = setInterval(updateTrimmerPlayhead, 50); // Update frequently for smooth playhead
    return () => clearInterval(interval);
  }, [trimStart, trimEnd]);

  const handleCancelOrBack = () => {
    if (isCropping) {
      handleCancelCrop(); // Reset cropping state
    } else {
      if (step === 1) {
        handleShowHighlightModal(false);
      } else {
        setStep(step - 1);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="w-full flex justify-between items-center p-4 absolute top-0 z-10">
        <button
          type="button"
          onClick={handleCancelOrBack}
          className="text-white p-2 rounded-full backdrop-blur-md border border-white/20 bg-black/10"
        >
          {step === 1 && !isCropping ? (
            <MdOutlineCancel className="w-6 h-6" />
          ) : (
            <ChevronLeftIcon className="w-6 h-6" />
          )}
        </button>

        <h2 className="text-white font-semibold text-lg backdrop-blur-md border border-white/20 bg-black/10 p-2 rounded-md">
          {isCropping
            ? "Edit Media"
            : step === 1
              ? "New Highlight"
              : "Upload Highlight"}
        </h2>

        {/* Next/Upload button */}
        {!isCropping && step === 2 && mediaItems.length > 0 && (
          <button
            type="button"
            onClick={() => setStep(3)}
            className="text-white font-semibold backdrop-blur-md border border-white/20 bg-black/10 p-2 rounded-md"
          >
            Next
          </button>
        )}

        {!isCropping && step === 3 && mediaItems.length > 0 && (
          <button
            type="button"
            onClick={() => {
              /* Handle upload */
            }}
            className="text-white font-semibold"
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        <div className="w-full h-full flex flex-col items-center justify-center relative">
          {/* Conditional rendering for ImageCropper or main steps */}
          {isCropping && imageToCrop ? (
            <div className="w-full h-[80%] md:w-[60%] bg-white overflow-y-scroll md:overflow-y-auto">
              <ImageCropper
                imagePreview={imageToCrop}
                handleCropped={handleCropped}
                handleCancel={handleCancelCrop}
              />
            </div>
          ) : step === 1 ? (
            // Your existing step 1 content
            <div className="flex flex-col items-center gap-8 p-6 text-center">
              <div className="bg-gray-800 p-6 rounded-full">
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
                className="px-8 py-6 md:text-lg rounded-md bg-black font-bold"
                onClick={() => fileInputRef.current?.click()}
              >
                Select from Gallery
              </Button>
            </div>
          ) : (step === 2 || step === 3) && mediaItems.length > 0 ? (
            // Your existing step 2/3 content
            <div
              className="w-full h-full flex items-center justify-center relative"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Desktop navigation buttons */}
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentIndex === 0 || isCropping}
                className={`hidden md:flex absolute h-24 my-auto inset-y-0 left-0 items-center justify-start pl-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
                  currentIndex === 0 || isCropping
                    ? "opacity-50"
                    : "hover:bg-opacity-70"
                }`}
              >
                <ChevronLeftIcon className="w-8 h-8" />
              </button>

              {/* Track editor */}
              {currentMedia.type === "video" && (
                <div className="absolute self-start w-full md:w-[50%] space-y-2 mt-20 z-20">
                  <div className="px-2">
                    <div className="flex justify-between text-white text-sm mb-2">
                      <span>Start: {formatDuration(trimStart)}</span>
                      <span>End: {formatDuration(trimEnd)}</span>
                      <span>
                        Duration: {formatDuration(trimEnd - trimStart)}
                      </span>
                    </div>

                    {/* WhatsApp-like track editor */}
                    <div
                      ref={trackEditorRef}
                      className="relative h-16 bg-gray-800 rounded-md cursor-pointer"
                      onClick={handleTrackEditorClick}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleTrackEditorClick(
                            e as unknown as React.MouseEvent,
                          ); // Cast to reuse the same function
                        }
                      }}
                      style={
                        {
                          "--playhead-position": "0%",
                        } as React.CSSProperties
                      } // Initialize custom CSS variable
                    >
                      {/* Preview thumbnails would go here in a real implementation */}
                      <div className="absolute inset-0 bg-gray-600 opacity-50">
                        Preview thumbnail
                      </div>

                      {/* Trim handles */}
                      <button
                        type="button"
                        className="absolute top-0 bottom-0 bg-black cursor-ew-resize z-20" // Increased z-index
                        style={{
                          left: `${
                            (trimStart / (currentMedia.duration || 1)) * 100
                          }%`,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleDragStart("start", e);
                        }}
                      >
                        <FaChevronLeft className="text-2xl text-white" />
                      </button>

                      <button
                        type="button"
                        className="absolute top-0 bottom-0 bg-black cursor-ew-resize z-20" // Increased z-index
                        style={{
                          right: `${
                            100 - (trimEnd / (currentMedia.duration || 1)) * 100
                          }%`,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleDragStart("end", e);
                        }}
                      >
                        <FaChevronRight className="text-2xl text-white" />
                      </button>

                      {/* Selected range - Middle draggable part */}
                      <div
                        className="absolute top-0 bottom-0 border-2 border-black bg-white bg-opacity-90 opacity-30 cursor-grab z-10" // Lower z-index than handles
                        style={{
                          left: `${
                            (trimStart / (currentMedia.duration || 1)) * 100
                          }%`,
                          right: `${
                            100 - (trimEnd / (currentMedia.duration || 1)) * 100
                          }%`,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleDragStart("middle", e);
                        }}
                      />
                      {/* Playhead for trimmer */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-white z-20" // Increased z-index
                        style={{
                          left: "var(--playhead-position)", // Use custom CSS variable
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center px-2 gap-2">
                    {/* Mute button */}
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="bg-black bg-opacity-50 p-2 rounded-full"
                    >
                      {isMuted ? (
                        <VolumeXIcon className="w-5 h-5 text-white" />
                      ) : (
                        <Volume2Icon className="w-5 h-5 text-white" />
                      )}
                    </button>

                    {/* Video duration indicator */}
                    <div className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                      {formatDuration(trimEnd - trimStart)}
                    </div>
                  </div>
                </div>
              )}

              {/* Media display */}
              <div className="w-full flex items-center justify-center relative overflow-hidden">
                {currentMedia.type === "image" ? (
                  <div className="relative w-full h-screen">
                    <button
                      type="button"
                      onClick={() => {
                        setImageToCrop(currentMedia.url); // Set the URL of the current image to crop
                        setIsCropping(true); // Open the cropper
                      }}
                      className="absolute top-36 md:top-20 right-4 bg-black bg-opacity-50 p-2 rounded-full z-10"
                    >
                      <ScissorsIcon className="w-5 h-5 text-white" />
                    </button>

                    <Image
                      src={currentMedia.url}
                      alt="Selected media"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="relative flex items-center justify-center w-full">
                    <video
                      ref={videoRef}
                      src={currentMedia.url}
                      className="max-w-full max-h-full"
                      onClick={togglePlayPause}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          togglePlayPause();
                        }
                      }}
                      tabIndex={0} // Makes the video focusable by keyboard
                      onEnded={handleVideoEnded}
                      muted={isMuted}
                      // controls={false} // Disable default controls to manage manually
                      playsInline
                      webkit-playsinline="true"
                      onLoadedMetadata={(e) => {
                        // Always set current time to trimStart when metadata loads
                        e.currentTarget.currentTime = trimStart;
                      }}
                      onTimeUpdate={() => {
                        // Update playhead position on the track editor
                        if (
                          trackEditorRef.current &&
                          videoRef.current &&
                          currentMedia?.duration
                        ) {
                          const playheadPercentage =
                            (videoRef.current.currentTime /
                              currentMedia.duration) *
                            100;
                          trackEditorRef.current.style.setProperty(
                            "--playhead-position",
                            `${playheadPercentage}%`,
                          );
                        }

                        // Loop playback within trim range
                        if (
                          videoRef.current &&
                          videoRef.current.currentTime >= trimEnd
                        ) {
                          videoRef.current.currentTime = trimStart;
                        }
                      }}
                    />

                    {/* Video controls overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            if (videoRef.current.paused) {
                              setIsPlaying(true);
                              videoRef.current.play();
                            } else {
                              setIsPlaying(false);
                              videoRef.current.pause();
                            }
                          }
                        }}
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
                )}
              </div>

              {/* Desktop navigation buttons */}
              <button
                type="button"
                onClick={handleNext}
                disabled={currentIndex === mediaItems.length - 1 || isCropping}
                className={`hidden md:flex absolute h-24 my-auto inset-y-0 right-0 items-center justify-end pr-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
                  currentIndex === mediaItems.length - 1 || isCropping
                    ? "opacity-50"
                    : "hover:bg-opacity-70"
                }`}
              >
                <ChevronRightIcon className="w-8 h-8" />
              </button>
            </div>
          ) : null}

          {/* Thumbnail strip */}
          <ThumbnailStrip
            currentIndex={currentIndex}
            mediaItems={mediaItems}
            setCurrentIndex={setCurrentIndex}
            handleDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}
