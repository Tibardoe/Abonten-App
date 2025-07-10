"use client";

import getUserHighlight from "@/actions/getUserHighlights";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { IoMdArrowBack } from "react-icons/io";
import { IoChevronBack, IoChevronForward, IoPlay } from "react-icons/io5";
import { SlControlPause } from "react-icons/sl";
import UserAvatar from "../atoms/UserAvatar";

type HighlightProps = {
  avatarUrl: string;
  username: string;
};

const slideDuration = 3000;

export default function UserHighlights({
  avatarUrl,
  username,
}: HighlightProps) {
  const [showHighlight, setShowHighlight] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [highlightError, setHighlightError] = useState<string | null>(null);

  const [currentHighlightIndex, setCurrentHighlightIndex] = useState<
    number | null
  >(null);

  const [showLeftArrow, setShowLeftArrow] = useState(false);

  const [showRightArrow, setShowRightArrow] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const [isPaused, setIsPaused] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollRef = useRef<HTMLUListElement>(null);

  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);

  const mediaStartTimeRef = useRef<number>(0);

  const mediaTimeElapsedOnPauseRef = useRef<number>(0);

  const { data: highlights } = useQuery({
    queryKey: ["higlights"],
    queryFn: async () => {
      const response = await getUserHighlight(username);

      if (response.status !== 200 && response.message) {
        setHighlightError(response.message);
      }

      return response.data;
    },
  });

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  //   useEffect(() => {
  //     if (timeoutRef.current) {
  //       clearTimeout(timeoutRef.current);
  //       timeoutRef.current = null;
  //     }

  //     // if (
  //     //   !showHighlight ||
  //     //   typeof currentHighlightIndex !== "number" ||
  //     //   isPaused ||
  //     //   !highlights
  //     // ) {
  //     //   return;
  //     // }

  //     if (
  //       !showHighlight ||
  //       typeof currentHighlightIndex !== "number" ||
  //       !highlights ||
  //       highlights.length === 0 ||
  //       !highlights[currentHighlightIndex]
  //     ) {
  //       // If highlights data isn't loaded yet or highlight is hidden, etc.
  //       return;
  //     }

  //     const currentMedia = highlights[currentHighlightIndex][currentIndex];

  //     if (!currentMedia) {
  //       // Handle case where currentMedia might be undefined (e.g., index out of bounds)
  //       setShowHighlight(false);
  //       setCurrentIndex(0);
  //       mediaTimeElapsedOnPauseRef.current = 0;
  //       return;
  //     }

  //     const mediaType = currentMedia.media_type;

  //     const currentMediaDuration =
  //       mediaType === "video"
  //         ? currentMedia.media_duration * 1000
  //         : slideDuration;

  //     const posts = highlights[currentHighlightIndex];

  //     if (currentIndex >= posts.length) {
  //       setShowHighlight(false);
  //       setCurrentIndex(0);
  //       timeElapsedOnPauseRef.current = 0;
  //       return;
  //     }

  //     const remainingTime =
  //       mediaType === "image"
  //         ? slideDuration
  //         : videoDuration - timeElapsedOnPauseRef.current;

  //     startTimeRef.current = Date.now() - timeElapsedOnPauseRef.current;

  //     timeoutRef.current = setTimeout(() => {
  //       setCurrentIndex((prev) => {
  //         timeElapsedOnPauseRef.current = 0;

  //         if (prev >= posts.length - 1) {
  //           setShowHighlight(false);
  //           return 0;
  //         }
  //         return prev + 1;
  //       });
  //     }, remainingTime);

  //     return () => {
  //       if (timeoutRef.current) {
  //         clearTimeout(timeoutRef.current);
  //         timeoutRef.current = null;
  //       }
  //     };
  //   }, [
  //     showHighlight,
  //     currentHighlightIndex,
  //     currentIndex,
  //     isPaused,
  //     highlights,
  //   ]);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (
      !showHighlight ||
      typeof currentHighlightIndex !== "number" ||
      !highlights ||
      highlights.length === 0 ||
      !highlights[currentHighlightIndex]
    ) {
      // If highlights data isn't loaded yet or highlight is hidden, etc.
      return;
    }

    const currentMedia = highlights[currentHighlightIndex][currentIndex];

    if (!currentMedia) {
      // Handle case where currentMedia might be undefined (e.g., index out of bounds)
      setShowHighlight(false);
      setCurrentIndex(0);
      mediaTimeElapsedOnPauseRef.current = 0;
      return;
    }

    const mediaType = currentMedia.media_type;
    const currentMediaDuration =
      mediaType === "video"
        ? currentMedia.media_duration * 1000
        : slideDuration;

    // Logic for playing/pausing video
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      } else {
        // Only play if not paused and video is loaded/ready
        // This will be handled by the video's onLoadedMetadata or when it renders
      }
    }

    if (isPaused) {
      // If paused, don't set any timeout
      return;
    }

    // Calculate remaining time for the current media
    const remainingTime =
      currentMediaDuration - mediaTimeElapsedOnPauseRef.current;
    mediaStartTimeRef.current = Date.now() - mediaTimeElapsedOnPauseRef.current;

    // Set a new timeout to advance the slide for images or for videos if they complete naturally
    // For videos, the onEnded event will handle progression, this timeout is a fallback or for images
    if (mediaType === "image") {
      timeoutRef.current = setTimeout(() => {
        setCurrentIndex((prev) => {
          mediaTimeElapsedOnPauseRef.current = 0; // Reset for the next slide
          if (prev >= highlights[currentHighlightIndex].length - 1) {
            setShowHighlight(false);
            return 0;
          }
          return prev + 1;
        });
      }, remainingTime);
    }
    // If it's a video, the video's 'onEnded' event will trigger the next slide
    // We don't set a timeout here for videos to avoid double progression.

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [
    showHighlight,
    currentHighlightIndex,
    currentIndex,
    isPaused,
    highlights,
  ]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollRef.current;

    if (!container) return;

    const scrollAmount = container.clientWidth * 0.75;

    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const checkScrollPosition = useCallback(() => {
    const container = scrollRef.current;

    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;

      setShowLeftArrow(scrollLeft > 0);

      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    const currentRef = scrollRef.current;
    if (currentRef) {
      currentRef.addEventListener("scroll", checkScrollPosition);
      checkScrollPosition(); // Initial check
    }
    return () => {
      if (currentRef) {
        currentRef.removeEventListener("scroll", checkScrollPosition);
      }
    };
  }, [checkScrollPosition]);

  const handleNextSlide = () => {
    if (typeof currentHighlightIndex === "number" && highlights) {
      const posts = highlights[currentHighlightIndex];
      mediaTimeElapsedOnPauseRef.current = 0;
      if (currentIndex >= posts.length - 1) {
        setShowHighlight(false);
        setCurrentIndex(0);
      } else {
        setCurrentIndex((prevIndex) => prevIndex + 1);
      }
    }
  };

  const handlePreviousSlide = () => {
    if (typeof currentHighlightIndex === "number") {
      mediaTimeElapsedOnPauseRef.current = 0;
      if (currentIndex <= 0) {
        setShowHighlight(false);
        setCurrentIndex(0);
      } else {
        setCurrentIndex((prevIndex) => prevIndex - 1);
      }
    }
  };

  // Function to toggle pause state and manage media playback
  const togglePause = () => {
    setIsPaused((prev) => {
      const newPausedState = !prev;

      if (!newPausedState) {
        mediaTimeElapsedOnPauseRef.current = 0;

        if (
          videoRef.current &&
          highlights &&
          typeof currentHighlightIndex === "number" &&
          highlights[currentHighlightIndex][currentIndex].media_type === "video"
        ) {
          videoRef.current
            .play()
            .catch((error) => console.error("Video play failed:", error));
        }
      } else {
        if (
          videoRef.current &&
          highlights &&
          typeof currentHighlightIndex === "number" &&
          highlights[currentHighlightIndex][currentIndex].media_type === "video"
        ) {
          // Store the current time of the video when paused
          mediaTimeElapsedOnPauseRef.current =
            videoRef.current.currentTime * 1000;
          videoRef.current.pause();
        } else if (mediaStartTimeRef.current !== 0) {
          // For images, calculate elapsed time
          mediaTimeElapsedOnPauseRef.current =
            Date.now() - mediaStartTimeRef.current;
          mediaTimeElapsedOnPauseRef.current = Math.max(
            0,
            Math.min(slideDuration, mediaTimeElapsedOnPauseRef.current),
          );
        } else {
          mediaTimeElapsedOnPauseRef.current = 0;
        }
      }
      return newPausedState;
    });
  };

  // Handlers for desktop click pause/resume
  const handleMediaClick = () => {
    togglePause();
  };

  const handleMediaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePause();
    }
  };

  // Handlers for mobile long press pause/resume
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
    }
    longPressTimeout.current = setTimeout(() => {
      if (!isPaused) {
        setIsPaused(true);
        // Record current time for video when long-pressing to pause
        if (
          videoRef.current &&
          highlights &&
          typeof currentHighlightIndex === "number" &&
          highlights[currentHighlightIndex][currentIndex].media_type === "video"
        ) {
          mediaTimeElapsedOnPauseRef.current =
            videoRef.current.currentTime * 1000;
          videoRef.current.pause();
        } else if (mediaStartTimeRef.current !== 0) {
          mediaTimeElapsedOnPauseRef.current =
            Date.now() - mediaStartTimeRef.current;
          mediaTimeElapsedOnPauseRef.current = Math.max(
            0,
            Math.min(slideDuration, mediaTimeElapsedOnPauseRef.current),
          );
        } else {
          mediaTimeElapsedOnPauseRef.current = 0;
        }
      }
    }, 500);
  };

  const handleTouchEnd = (
    e: React.TouchEvent<HTMLDivElement>,
    action: "next" | "prev",
  ) => {
    e.stopPropagation();
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    if (!isPaused) {
      if (action === "prev") {
        handlePreviousSlide();
      } else {
        handleNextSlide();
      }
    } else {
      setIsPaused(false);
      mediaTimeElapsedOnPauseRef.current = 0;
    }
  };

  // Handle video metadata loaded to set current time and play
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current && !isPaused) {
      // Set video's current time to where it was paused
      videoRef.current.currentTime = mediaTimeElapsedOnPauseRef.current / 1000;
      videoRef.current
        .play()
        .catch((error) => console.error("Video play failed on load:", error));
    }
  }, [isPaused]);

  // Effect to ensure video plays/pauses on current index change or pause state change
  useEffect(() => {
    if (
      videoRef.current &&
      highlights &&
      typeof currentHighlightIndex === "number"
    ) {
      const currentMedia = highlights[currentHighlightIndex][currentIndex];
      if (currentMedia && currentMedia.media_type === "video") {
        if (isPaused) {
          videoRef.current.pause();
        } else {
          // Attempt to play if not paused. onLoadedMetadata will handle initial play.
          videoRef.current
            .play()
            .catch((error) =>
              console.error("Video play failed in useEffect:", error),
            );
        }
      }
    }
  }, [currentIndex, isPaused, highlights, currentHighlightIndex]);

  if (highlightError) {
    return <div className="text-red-500">Error: {highlightError}</div>;
  }

  return (
    highlights && (
      <>
        <div className="relative">
          {/* Desktop scroll left */}
          {showLeftArrow && (
            <button
              type="button"
              onClick={() => scroll("left")}
              className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
            >
              <IoChevronBack className="text-2xl text-white" />
            </button>
          )}

          {/* Desktop scroll right */}
          {showRightArrow && (
            <button
              type="button"
              onClick={() => scroll("right")}
              className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
            >
              <IoChevronForward className="text-2xl text-white" />
            </button>
          )}

          {/* List of highlights */}
          <ul
            ref={scrollRef}
            className="flex items-center overflow-x-auto scrollbar-hide"
          >
            {highlights.map((item, index) => {
              const lastPost = item.length - 1;

              return (
                <li key={index.toString()} className="shrink-0">
                  <button
                    type="button"
                    className="m-1 rounded-full border-4 border-black flex items-center justify-center"
                    onClick={() => {
                      setShowHighlight(true);
                      setCurrentHighlightIndex(index);
                      setCurrentIndex(0);
                      setIsPaused(false);
                      mediaTimeElapsedOnPauseRef.current = 0;
                      mediaStartTimeRef.current = Date.now();
                    }}
                  >
                    <Image
                      src={
                        item[lastPost].media_type === "video"
                          ? item[lastPost].thumbnail_url
                          : item[lastPost].media_url
                      }
                      alt="Highlight"
                      width={70}
                      height={70}
                      className="object-cover w-[70px] h-[70px] rounded-full m-[2px] border border-black"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {showHighlight && (
          <div className="fixed left-0 top-0 z-30 w-full h-dvh bg-black flex items-center justify-center">
            <div className="w-[95%] absolute top-5 flex flex-col-reverse md:flex-row items-center gap-3 z-10">
              {/* Mobile story tracker bar and user profile */}
              <div className="self-start flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowHighlight(false);
                    setCurrentIndex(0);
                    setIsPaused(false);
                    mediaTimeElapsedOnPauseRef.current = 0;
                    if (videoRef.current) {
                      videoRef.current.pause();
                      videoRef.current.currentTime = 0;
                    }
                  }}
                >
                  <IoMdArrowBack className="text-xl text-white" />
                </button>

                <div className="flex items-start gap-2 md:hidden">
                  <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

                  <div className="text-white text-sm font-bold">
                    <p>{username}</p>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-[90%] lg:w-[60%] md:space-y-3 mx-auto">
                <ul className="flex items-center gap-1">
                  {typeof currentHighlightIndex === "number" &&
                    highlights[currentHighlightIndex].map((item, index) => (
                      <li
                        key={item.id}
                        className="w-full flex items-center h-1 rounded-full bg-white bg-opacity-50 shadow-md"
                      >
                        {index === currentIndex ? (
                          <span
                            className="bg-white h-1 animate-story"
                            style={{
                              animationPlayState: isPaused
                                ? "paused"
                                : "running",
                            }}
                          />
                        ) : (
                          <span
                            className={`bg-white h-1 ${
                              index < currentIndex ? "w-full" : "w-0"
                            }`}
                          />
                        )}
                      </li>
                    ))}
                </ul>

                {/* Desktop user profile */}
                <div className="w-full flex justify-between items-center">
                  <div className="items-start gap-2 hidden md:flex">
                    <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

                    <div className="text-white text-sm font-bold">
                      <p>{username}</p>
                    </div>
                  </div>

                  {/* Indicator for pause and play */}
                  <div className="hidden md:flex">
                    {isPaused ? (
                      <SlControlPause className="text-white text-2xl" />
                    ) : (
                      <IoPlay className="text-white text-2xl" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {typeof currentHighlightIndex === "number" && (
              <div className="flex items-center h-full">
                {/* Desktop button for viewing previous slide */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreviousSlide();
                  }}
                  className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
                >
                  <IoChevronBack className="text-2xl text-white" />
                </button>

                {/* Desktop button for viewing next next */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextSlide();
                  }}
                  className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
                >
                  <IoChevronForward className="text-2xl text-white" />
                </button>

                {/* Media */}
                <div
                  className="h-full flex items-center justify-center relative"
                  onClick={handleMediaClick}
                  onKeyDown={handleMediaKeyDown}
                  tabIndex={0}
                  // biome-ignore lint/a11y/useSemanticElements: <explanation>
                  role="button"
                >
                  {/* Moble gesture for left tap zone */}
                  <div
                    className="absolute left-0 top-0 w-1/2 h-full lg:hidden"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={(e) => handleTouchEnd(e, "prev")}
                  />

                  {/* Moble gesture for right tap zone */}
                  <div
                    className="absolute right-0 top-0 w-1/2 h-full lg:hidden"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={(e) => handleTouchEnd(e, "next")}
                  />

                  {isLoading ? (
                    <div className="text-white">Loading highlights...</div>
                  ) : (
                    <>
                      {highlights[currentHighlightIndex][currentIndex]
                        .media_type === "image" ? (
                        <Image
                          src={
                            highlights[currentHighlightIndex][currentIndex]
                              .media_url
                          }
                          alt="Highlight"
                          width={700}
                          height={700}
                          className="object-contain cursor-pointer max-w-full max-h-full"
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          src={
                            highlights[currentHighlightIndex][currentIndex]
                              .media_url
                          }
                          className="max-w-full max-h-full"
                          controls={false}
                          playsInline
                          autoPlay
                          onEnded={handleNextSlide}
                          onLoadedMetadata={handleVideoLoadedMetadata}
                          muted={false}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </>
    )
  );
}
