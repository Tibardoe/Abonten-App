import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdOutlineCancel } from "react-icons/md";
import { Button } from "../ui/button";
import ImageCropper from "./ImageCropper";

type ClosePopupModalType = {
  handleShowHighlightModal: (state: boolean) => void;
};

type MediaItem = {
  url: string;
  file: File;
  type: "image" | "video";
  duration?: number; // Original full duration for videos
  startTime?: number; // Trimmed start time
  endTime?: number; // Trimmed end time
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
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<
    "start" | "end" | "middle" | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTrimmerRef = useRef<HTMLVideoElement>(null);
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
    if (touchStartX.current - touchEndX.current > 50) {
      handleNext();
    } else if (touchEndX.current - touchStartX.current > 50) {
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
      video.onloadedmetadata = () => {
        resolve(video.duration);
      };
      video.onerror = () => {
        console.error("Error loading video metadata for:", url);
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
        try {
          duration = await getVideoDuration(url);
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
          });
        } else {
          newMediaItems.push({
            url,
            file,
            type: "video",
            duration,
            startTime: 0,
            endTime: duration, // Full duration if within limit
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
      setShowVideoTrimmer(false); // Hide trimmer when navigating
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(false);
      setShowVideoTrimmer(false); // Hide trimmer when navigating
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
    setShowVideoTrimmer(false);
  };

  // Video trimming functions
  const toggleVideoTrimmer = () => {
    if (currentMedia?.type === "video" && videoRef.current) {
      setShowVideoTrimmer(!showVideoTrimmer);
      if (!showVideoTrimmer) {
        // If opening trimmer
        // Initialize trim values based on current media's saved trim or full duration
        setTrimStart(currentMedia.startTime || 0);
        setTrimEnd(currentMedia.endTime || currentMedia.duration || 0);

        if (videoTrimmerRef.current) {
          videoTrimmerRef.current.currentTime = currentMedia.startTime || 0;
          videoTrimmerRef.current.pause(); // Ensure trimmer video is paused when opened
        }
      }
      setIsPlaying(false); // Pause main video when opening trimmer
    }
  };

  const handleTrackEditorClick = (e: React.MouseEvent) => {
    if (
      !trackEditorRef.current ||
      !currentMedia ||
      currentMedia.type !== "video" ||
      !videoTrimmerRef.current
    )
      return;

    const rect = trackEditorRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const percentage = clickPosition / rect.width;
    const totalVideoDuration = currentMedia.duration || 0;
    const seekTime = percentage * totalVideoDuration;

    videoTrimmerRef.current.currentTime = Math.min(
      seekTime,
      totalVideoDuration,
    );
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

        if (videoTrimmerRef.current) {
          videoTrimmerRef.current.currentTime = newStart;
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

        if (videoTrimmerRef.current) {
          videoTrimmerRef.current.currentTime = newEnd;
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

        if (videoTrimmerRef.current) {
          videoTrimmerRef.current.currentTime = potentialNewStart;
        }
      }
    },
    [isDragging, dragHandle, trimStart, trimEnd, currentMedia],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
    dragOffset.current = 0;

    if (videoTrimmerRef.current) {
      videoTrimmerRef.current.currentTime = trimStart;
      videoTrimmerRef.current.pause();
    }
  }, [trimStart]);

  const applyTrim = () => {
    if (currentMedia?.type === "video") {
      const updatedMediaItems = [...mediaItems];
      updatedMediaItems[currentIndex] = {
        ...updatedMediaItems[currentIndex],
        startTime: trimStart,
        endTime: trimEnd,
      } as MediaItem;

      setMediaItems(updatedMediaItems);
      setShowVideoTrimmer(false);

      if (videoRef.current) {
        // Stop any current playback
        videoRef.current.pause();
        setIsPlaying(false);

        // Set the current time immediately
        videoRef.current.currentTime = trimStart;

        // IMPORTANT: Call load() and then wait for 'canplay' or 'loadeddata'
        // before attempting to play to avoid the "interrupted by new load" error.
        // We ensure the video is ready to play from the new start time.
        videoRef.current.load();

        const playAfterLoad = () => {
          if (videoRef.current) {
            videoRef.current
              .play()
              .then(() => {
                setIsPlaying(true);
              })
              .catch((error) => {
                console.error("Error playing video after trim:", error);
                // Handle cases where play() fails (e.g., autoplay policies)
                // Maybe show a play button to the user instead
              });
            videoRef.current.removeEventListener("canplay", playAfterLoad);
            videoRef.current.removeEventListener("loadeddata", playAfterLoad);
          }
        };

        videoRef.current.addEventListener("canplay", playAfterLoad);
        // Fallback for some browsers or scenarios
        videoRef.current.addEventListener("loadeddata", playAfterLoad);
      }
    }
  };

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
    setShowVideoTrimmer(false);
    // Ensure video is loaded with correct start time when switching items
    if (videoRef.current && currentMedia?.type === "video") {
      videoRef.current.currentTime = currentMedia.startTime || 0;
      videoRef.current.load(); // Explicitly load to ensure correct segment is ready
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
      if (videoTrimmerRef.current) {
        videoTrimmerRef.current.currentTime = currentMedia.startTime || 0;
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
    if (videoRef.current && currentMedia?.type === "video" && isPlaying) {
      const interval = setInterval(() => {
        if (videoRef.current && currentMedia.endTime !== undefined) {
          if (videoRef.current.currentTime >= currentMedia.endTime) {
            videoRef.current.pause();
            videoRef.current.currentTime = currentMedia.startTime || 0;
            setIsPlaying(false);
          }
        }
      }, 100); // Check every 100ms
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentMedia]);

  // Effect to handle video playback within trim range for trimmer video
  useEffect(() => {
    if (
      videoTrimmerRef.current &&
      currentMedia?.type === "video" &&
      showVideoTrimmer
    ) {
      const updateTrimmerPlayhead = () => {
        if (videoTrimmerRef.current) {
          // If playing and goes past end trim, loop back to start trim
          if (
            !videoTrimmerRef.current.paused &&
            videoTrimmerRef.current.currentTime >= trimEnd
          ) {
            videoTrimmerRef.current.currentTime = trimStart;
          }
        }
      };
      const interval = setInterval(updateTrimmerPlayhead, 50); // Update frequently for smooth playhead
      return () => clearInterval(interval);
    }
  }, [showVideoTrimmer, trimStart, trimEnd, currentMedia]);

  const handleCancelOrBack = () => {
    if (isCropping || showVideoTrimmer) {
      handleCancelCrop(); // Reset cropping state
      setShowVideoTrimmer(false); // Hide trimmer
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
          className="text-white p-2"
        >
          {step === 1 && !isCropping && !showVideoTrimmer ? (
            <MdOutlineCancel className="w-6 h-6" />
          ) : (
            <ChevronLeftIcon className="w-6 h-6" />
          )}
        </button>

        <h2 className="text-white font-semibold text-lg">
          {isCropping || showVideoTrimmer
            ? "Edit Media"
            : step === 1
              ? "New Highlight"
              : "Upload Highlight"}
        </h2>

        {/* Next/Upload button */}
        {!(isCropping || showVideoTrimmer) &&
          step === 2 &&
          mediaItems.length > 0 && (
            <button
              type="button"
              onClick={() => setStep(3)}
              className="text-white font-semibold"
            >
              Next
            </button>
          )}

        {!(isCropping || showVideoTrimmer) &&
          step === 3 &&
          mediaItems.length > 0 && (
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
                disabled={currentIndex === 0 || isCropping || showVideoTrimmer}
                className={`hidden md:flex absolute h-24 my-auto inset-y-0 left-0 items-center justify-start pl-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
                  currentIndex === 0 || isCropping || showVideoTrimmer
                    ? "opacity-50"
                    : "hover:bg-opacity-70"
                }`}
              >
                <ChevronLeftIcon className="w-8 h-8" />
              </button>

              {/* Media display */}
              <div className="w-[95%] h-[70%] flex items-center justify-center relative overflow-hidden">
                {currentMedia.type === "image" ? (
                  <Image
                    src={currentMedia.url}
                    alt="Selected media"
                    fill
                    className="object-contain"
                  />
                ) : (
                  <div className="relative flex items-center justify-center w-full h-full">
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
                      onLoadedMetadata={(e) => {
                        e.currentTarget.currentTime =
                          currentMedia.startTime || 0;
                      }}
                      onTimeUpdate={(e) => {
                        if (isPlaying && currentMedia.endTime !== undefined) {
                          if (
                            e.currentTarget.currentTime >= currentMedia.endTime
                          ) {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime =
                              currentMedia.startTime || 0;
                            setIsPlaying(false);
                          }
                        }
                      }}
                    />

                    {/* Video controls overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={togglePlayPause}
                        className="p-4 bg-black bg-opacity-50 rounded-full"
                      >
                        {isPlaying ? (
                          <PauseIcon className="w-10 h-10 text-white" />
                        ) : (
                          <PlayIcon className="w-10 h-10 text-white" />
                        )}
                      </button>
                    </div>

                    {/* Video duration indicator */}
                    <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                      {/* Display trimmed duration if applicable, otherwise full duration */}
                      {currentMedia.startTime !== undefined &&
                      currentMedia.endTime !== undefined
                        ? formatDuration(
                            currentMedia.endTime - currentMedia.startTime,
                          )
                        : formatDuration(currentMedia.duration || 0)}
                    </div>

                    {/* Mute button */}
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="absolute top-4 right-16 bg-black bg-opacity-50 p-2 rounded-full"
                    >
                      {isMuted ? (
                        <VolumeXIcon className="w-5 h-5 text-white" />
                      ) : (
                        <Volume2Icon className="w-5 h-5 text-white" />
                      )}
                    </button>

                    {/* Trim button */}
                    {currentMedia.type === "video" && (
                      <button
                        type="button"
                        onClick={toggleVideoTrimmer}
                        className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-full"
                      >
                        <ScissorsIcon className="w-5 h-5 text-white" />
                      </button>
                    )}
                  </div>
                )}
                {/* Crop button for images, visible only if not currently cropping */}
                {currentMedia?.type === "image" && !isCropping && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageToCrop(currentMedia.url); // Set the URL of the current image to crop
                      setIsCropping(true); // Open the cropper
                    }}
                    className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-full"
                  >
                    <ScissorsIcon className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>

              {/* Desktop navigation buttons */}
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  currentIndex === mediaItems.length - 1 ||
                  isCropping ||
                  showVideoTrimmer
                }
                className={`hidden md:flex absolute h-24 my-auto inset-y-0 right-0 items-center justify-end pr-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
                  currentIndex === mediaItems.length - 1 ||
                  isCropping ||
                  showVideoTrimmer
                    ? "opacity-50"
                    : "hover:bg-opacity-70"
                }`}
              >
                <ChevronRightIcon className="w-8 h-8" />
              </button>
            </div>
          ) : null}

          {/* Video Trimmer Overlay */}
          {showVideoTrimmer && currentMedia?.type === "video" && (
            <div className="absolute inset-0 bg-black bg-opacity-90 z-30 flex flex-col items-center justify-center p-4">
              <div className="w-full max-w-2xl">
                <video
                  ref={videoTrimmerRef}
                  src={currentMedia.url}
                  className="w-full h-50%"
                  controls={false} // Disable default controls to manage manually
                  onLoadedMetadata={(e) => {
                    // Always set current time to trimStart when metadata loads
                    e.currentTarget.currentTime = trimStart;
                  }}
                  onTimeUpdate={() => {
                    // Update playhead position on the track editor
                    if (
                      trackEditorRef.current &&
                      videoTrimmerRef.current &&
                      currentMedia?.duration
                    ) {
                      const playheadPercentage =
                        (videoTrimmerRef.current.currentTime /
                          currentMedia.duration) *
                        100;
                      trackEditorRef.current.style.setProperty(
                        "--playhead-position",
                        `${playheadPercentage}%`,
                      );
                    }

                    // Loop playback within trim range
                    if (
                      videoTrimmerRef.current &&
                      videoTrimmerRef.current.currentTime >= trimEnd
                    ) {
                      videoTrimmerRef.current.currentTime = trimStart;
                    }
                  }}
                >
                  <track kind="captions" srcLang="en" label="No captions" />
                </video>

                <div className="mt-4">
                  <div className="flex justify-between text-white text-sm mb-2">
                    <span>Start: {formatDuration(trimStart)}</span>
                    <span>End: {formatDuration(trimEnd)}</span>
                    <span>Duration: {formatDuration(trimEnd - trimStart)}</span>
                  </div>

                  {/* WhatsApp-like track editor */}
                  <div
                    ref={trackEditorRef}
                    className="relative h-16 bg-gray-700 rounded-md cursor-pointer"
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
                      { "--playhead-position": "0%" } as React.CSSProperties
                    } // Initialize custom CSS variable
                  >
                    {/* Preview thumbnails would go here in a real implementation */}
                    <div className="absolute inset-0 bg-gray-600 opacity-50">
                      Preview thumbnail
                    </div>

                    {/* Trim handles */}
                    <div
                      className="absolute top-0 bottom-0 w-2 bg-blue-500 cursor-ew-resize z-20" // Increased z-index
                      style={{
                        left: `${
                          (trimStart / (currentMedia.duration || 1)) * 100
                        }%`,
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleDragStart("start", e);
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-2 bg-blue-500 cursor-ew-resize z-20" // Increased z-index
                      style={{
                        right: `${
                          100 - (trimEnd / (currentMedia.duration || 1)) * 100
                        }%`,
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleDragStart("end", e);
                      }}
                    />

                    {/* Selected range - Middle draggable part */}
                    <div
                      className="absolute top-0 bottom-0 bg-blue-500 opacity-30 cursor-grab z-10" // Lower z-index than handles
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
                  <div className="flex justify-center mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (videoTrimmerRef.current) {
                          if (videoTrimmerRef.current.paused) {
                            videoTrimmerRef.current.play();
                          } else {
                            videoTrimmerRef.current.pause();
                          }
                        }
                      }}
                      className="p-2 bg-gray-800 rounded-full text-white"
                    >
                      {videoTrimmerRef.current?.paused ? (
                        <PlayIcon className="w-5 h-5" />
                      ) : (
                        <PauseIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowVideoTrimmer(false)}
                    className="px-4 py-2 text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyTrim}
                    className="px-4 py-2 bg-white text-black rounded-md"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Thumbnail strip */}
          {(step === 2 || step === 3) &&
            mediaItems.length > 0 &&
            !isCropping &&
            !showVideoTrimmer && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                <div className="flex gap-2 overflow-x-auto py-2">
                  {mediaItems.map((item, index) => (
                    <div
                      key={item.url} // Using item.url as key for better stability if order changes
                      className={`relative w-16 h-16 rounded-md overflow-hidden ${
                        currentIndex === index
                          ? "ring-2 ring-black"
                          : "opacity-70"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setCurrentIndex(index)}
                        className="w-full h-full"
                      >
                        {item.type === "image" ? (
                          <Image
                            src={item.url}
                            alt="Thumbnail"
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <>
                            <video
                              src={item.url}
                              className="w-full h-full object-cover"
                            >
                              <track
                                kind="captions"
                                srcLang="en"
                                label="No captions"
                              />
                            </video>

                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                              {/* Display trimmed duration for thumbnails */}
                              {item.startTime !== undefined &&
                              item.endTime !== undefined
                                ? formatDuration(item.endTime - item.startTime)
                                : formatDuration(item.duration || 0)}
                            </div>
                          </>
                        )}
                      </button>

                      {currentIndex === index && (
                        <button
                          type="button"
                          onClick={() => handleDelete(index)}
                          className="absolute top-[50%] right-[50%] bg-black bg-opacity-50 text-white rounded-md transform translate-x-1/2 -translate-y-1/2"
                        >
                          <Trash2Icon className="text-5xl" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// Helper function to format duration (seconds to MM:SS)
function formatDuration(duration: number): string {
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
