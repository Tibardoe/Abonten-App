"use client";

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

const media = [
  {
    posts: [
      "/assets/eventFlyers/flyer1.jpg",
      "/assets/eventFlyers/flyer2.jpg",
      "/assets/eventFlyers/flyer3.jpg",
      "/assets/eventFlyers/flyer4.jpg",
      "/assets/eventFlyers/flyer5.jpg",
      "/assets/eventFlyers/flyer6.jpg",
      "/assets/eventFlyers/flyer7.jpg",
      "/assets/eventFlyers/flyer8.jpg",
      "/assets/eventFlyers/flyer9.jpg",
      "/assets/eventFlyers/flyer10.jpg",
    ],
  },
  {
    posts: [
      "/assets/eventFlyers/flyer11.jpg",
      "/assets/eventFlyers/flyer12.jpg",
      "/assets/eventFlyers/flyer13.jpg",
      "/assets/eventFlyers/flyer14.jpg",
      "/assets/eventFlyers/flyer15.jpg",
      "/assets/eventFlyers/flyer16.jpg",
      "/assets/eventFlyers/flyer17.jpg",
      "/assets/eventFlyers/flyer18.jpg",
      "/assets/eventFlyers/flyer19.jpg",
      "/assets/eventFlyers/flyer20.jpg",
    ],
  },
  {
    posts: [
      "/assets/eventFlyers/flyer21.jpg",
      "/assets/eventFlyers/flyer22.jpg",
      "/assets/eventFlyers/flyer23.jpg",
      "/assets/eventFlyers/flyer24.jpg",
      "/assets/eventFlyers/flyer25.jpg",
      "/assets/eventFlyers/flyer26.jpg",
      "/assets/eventFlyers/flyer27.jpg",
      "/assets/eventFlyers/flyer28.jpg",
      "/assets/eventFlyers/flyer29.jpg",
      "/assets/eventFlyers/flyer30.jpg",
    ],
  },
  { posts: ["/assets/eventFlyers/flyer31.jpg"] },
];

export default function UserHighlights({
  avatarUrl,
  username,
}: HighlightProps) {
  const [showHighlight, setShowHighlight] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [currentHighlightIndex, setCurrentHighlightIndex] = useState<
    number | null
  >(null);

  const [showLeftArrow, setShowLeftArrow] = useState(false);

  const [showRightArrow, setShowRightArrow] = useState(false);

  const [isPaused, setIsPaused] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollRef = useRef<HTMLUListElement>(null);

  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);

  const startTimeRef = useRef<number>(0);

  const timeElapsedOnPauseRef = useRef<number>(0);

  const type = "image";

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (
      !showHighlight ||
      typeof currentHighlightIndex !== "number" ||
      isPaused
    ) {
      return;
    }

    const posts = media[currentHighlightIndex].posts;

    if (currentIndex >= posts.length) {
      setShowHighlight(false);
      setCurrentIndex(0);
      timeElapsedOnPauseRef.current = 0;
      return;
    }

    const remainingTime = slideDuration - timeElapsedOnPauseRef.current;

    startTimeRef.current = Date.now() - timeElapsedOnPauseRef.current;

    timeoutRef.current = setTimeout(() => {
      setCurrentIndex((prev) => {
        timeElapsedOnPauseRef.current = 0;

        if (prev >= posts.length - 1) {
          setShowHighlight(false);
          return 0;
        }
        return prev + 1;
      });
    }, remainingTime);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [showHighlight, currentHighlightIndex, currentIndex, isPaused]);

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
    if (typeof currentHighlightIndex === "number") {
      const posts = media[currentHighlightIndex].posts;

      timeElapsedOnPauseRef.current = 0;

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
      timeElapsedOnPauseRef.current = 0;
      if (currentIndex <= 0) {
        setShowHighlight(false);
        setCurrentIndex(0);
      } else {
        setCurrentIndex((prevIndex) => prevIndex - 1);
      }
    }
  };

  // Function to toggle pause state and manage timeout
  const togglePause = () => {
    setIsPaused((prev) => {
      if (prev) {
        timeElapsedOnPauseRef.current = 0;
      } else {
        if (startTimeRef.current !== 0) {
          timeElapsedOnPauseRef.current = Date.now() - startTimeRef.current;
          timeElapsedOnPauseRef.current = Math.max(
            0,
            Math.min(slideDuration, timeElapsedOnPauseRef.current),
          );
        } else {
          timeElapsedOnPauseRef.current = 0;
        }
      }
      return !prev;
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
    // Set a timeout to pause if held for 500ms
    longPressTimeout.current = setTimeout(() => {
      // Only pause if not already paused
      if (!isPaused) {
        setIsPaused(true);
        if (startTimeRef.current !== 0) {
          timeElapsedOnPauseRef.current = Date.now() - startTimeRef.current;
          timeElapsedOnPauseRef.current = Math.max(
            0,
            Math.min(slideDuration, timeElapsedOnPauseRef.current),
          );
        } else {
          timeElapsedOnPauseRef.current = 0;
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
      timeElapsedOnPauseRef.current = 0;
    }
  };

  return (
    media && (
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
            {media.map((item, index) => {
              const lastPost = item.posts.length - 1;

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
                      timeElapsedOnPauseRef.current = 0;
                      startTimeRef.current = Date.now();
                    }}
                  >
                    <Image
                      src={item.posts[lastPost]}
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
            <div className="w-[95%] absolute top-5 flex flex-col-reverse md:flex-row items-center gap-3">
              {/* Mobile story tracker bar and user profile */}
              <div className="self-start flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowHighlight(false);
                    setCurrentIndex(0);
                    setIsPaused(false);
                    timeElapsedOnPauseRef.current = 0;
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
                    media[currentHighlightIndex].posts.map((item, index) => (
                      <li
                        key={item}
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
                  className="h-full flex items-center justify-center"
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

                  {type === "image" ? (
                    <Image
                      src={media[currentHighlightIndex].posts[currentIndex]}
                      alt="Highlight"
                      width={700}
                      height={700}
                      className="object-contain cursor-pointer max-w-full max-h-full"
                    />
                  ) : (
                    "Video component"
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
