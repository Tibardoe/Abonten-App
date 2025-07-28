// "use client";

// import getUserHighlight from "@/actions/getUserHighlights";
// import { useQuery } from "@tanstack/react-query";
// import Image from "next/image";
// import { useCallback, useEffect, useRef, useState } from "react";
// import { IoMdArrowBack } from "react-icons/io";
// import { IoChevronBack, IoChevronForward, IoPlay } from "react-icons/io5";
// import { SlControlPause } from "react-icons/sl";
// import UserAvatar from "../atoms/UserAvatar";

// type HighlightProps = {
//   avatarUrl: string;
//   username: string;
// };

// const slideDuration = 3000;

// export default function UserHighlights({
//   avatarUrl,
//   username,
// }: HighlightProps) {
//   const [showHighlight, setShowHighlight] = useState(false);

//   const [currentIndex, setCurrentIndex] = useState(0);

//   const [highlightError, setHighlightError] = useState<string | null>(null);

//   const [currentHighlightIndex, setCurrentHighlightIndex] = useState<
//     number | null
//   >(null);

//   const [showLeftArrow, setShowLeftArrow] = useState(false);

//   const [showRightArrow, setShowRightArrow] = useState(false);

//   const [isLoading, setIsLoading] = useState(false);

//   const [isPaused, setIsPaused] = useState(false);

//   const [currentAnimationDuration, setCurrentAnimationDuration] =
//     useState("3s");

//   const videoRef = useRef<HTMLVideoElement>(null);

//   const timeoutRef = useRef<NodeJS.Timeout | null>(null);

//   const scrollRef = useRef<HTMLUListElement>(null);

//   const longPressTimeout = useRef<NodeJS.Timeout | null>(null);

//   const mediaStartTimeRef = useRef<number>(0);

//   const mediaTimeElapsedOnPauseRef = useRef<number>(0);

//   const { data: highlights } = useQuery({
//     queryKey: ["highlights"],
//     queryFn: async () => {
//       const response = await getUserHighlight(username);

//       if (response.status !== 200 && response.message) {
//         setHighlightError(response.message);
//       }

//       return response.data;
//     },
//   });

//   useEffect(() => {
//     return () => {
//       if (timeoutRef.current) {
//         clearTimeout(timeoutRef.current);
//       }
//     };
//   }, []);

//   useEffect(() => {
//     if (timeoutRef.current) {
//       clearTimeout(timeoutRef.current);
//       timeoutRef.current = null;
//     }

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

//     setCurrentAnimationDuration(`${currentMediaDuration / 1000}s`);

//     // Logic for playing/pausing video
//     if (videoRef.current) {
//       if (isPaused) {
//         videoRef.current.pause();
//       } else {
//         // Only play if not paused and video is loaded/ready
//         // This will be handled by the video's onLoadedMetadata or when it renders
//       }
//     }

//     if (isPaused) {
//       // If paused, don't set any timeout
//       return;
//     }

//     // Calculate remaining time for the current media
//     const remainingTime =
//       currentMediaDuration - mediaTimeElapsedOnPauseRef.current;
//     mediaStartTimeRef.current = Date.now() - mediaTimeElapsedOnPauseRef.current;

//     // Set a new timeout to advance the slide for images or for videos if they complete naturally
//     // For videos, the onEnded event will handle progression, this timeout is a fallback or for images
//     if (mediaType === "image") {
//       timeoutRef.current = setTimeout(() => {
//         setCurrentIndex((prev) => {
//           mediaTimeElapsedOnPauseRef.current = 0; // Reset for the next slide
//           if (prev >= highlights[currentHighlightIndex].length - 1) {
//             setShowHighlight(false);
//             return 0;
//           }
//           return prev + 1;
//         });
//       }, remainingTime);
//     }
//     // If it's a video, the video's 'onEnded' event will trigger the next slide
//     // We don't set a timeout here for videos to avoid double progression.

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

//   const scroll = (direction: "left" | "right") => {
//     const container = scrollRef.current;

//     if (!container) return;

//     const scrollAmount = container.clientWidth * 0.75;

//     container.scrollBy({
//       left: direction === "left" ? -scrollAmount : scrollAmount,
//       behavior: "smooth",
//     });
//   };

//   const checkScrollPosition = useCallback(() => {
//     const container = scrollRef.current;

//     if (container) {
//       const { scrollLeft, scrollWidth, clientWidth } = container;

//       setShowLeftArrow(scrollLeft > 0);

//       setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
//     }
//   }, []);

//   useEffect(() => {
//     const currentRef = scrollRef.current;
//     if (currentRef) {
//       currentRef.addEventListener("scroll", checkScrollPosition);
//       checkScrollPosition(); // Initial check
//     }
//     return () => {
//       if (currentRef) {
//         currentRef.removeEventListener("scroll", checkScrollPosition);
//       }
//     };
//   }, [checkScrollPosition]);

//   const handleNextSlide = () => {
//     if (typeof currentHighlightIndex === "number" && highlights) {
//       const posts = highlights[currentHighlightIndex];
//       mediaTimeElapsedOnPauseRef.current = 0;
//       if (currentIndex >= posts.length - 1) {
//         setShowHighlight(false);
//         setCurrentIndex(0);
//       } else {
//         setCurrentIndex((prevIndex) => prevIndex + 1);
//       }
//     }
//   };

//   const handlePreviousSlide = () => {
//     if (typeof currentHighlightIndex === "number") {
//       mediaTimeElapsedOnPauseRef.current = 0;
//       if (currentIndex <= 0) {
//         setShowHighlight(false);
//         setCurrentIndex(0);
//       } else {
//         setCurrentIndex((prevIndex) => prevIndex - 1);
//       }
//     }
//   };

//   // Function to toggle pause state and manage media playback
//   const togglePause = () => {
//     setIsPaused((prev) => {
//       const newPausedState = !prev;

//       if (!newPausedState) {
//         mediaTimeElapsedOnPauseRef.current = 0;

//         if (
//           videoRef.current &&
//           highlights &&
//           typeof currentHighlightIndex === "number" &&
//           highlights[currentHighlightIndex][currentIndex].media_type === "video"
//         ) {
//           videoRef.current
//             .play()
//             .catch((error) => console.error("Video play failed:", error));
//         }
//       } else {
//         if (
//           videoRef.current &&
//           highlights &&
//           typeof currentHighlightIndex === "number" &&
//           highlights[currentHighlightIndex][currentIndex].media_type === "video"
//         ) {
//           // Store the current time of the video when paused
//           mediaTimeElapsedOnPauseRef.current =
//             videoRef.current.currentTime * 1000;
//           videoRef.current.pause();
//         } else if (mediaStartTimeRef.current !== 0) {
//           // For images, calculate elapsed time
//           mediaTimeElapsedOnPauseRef.current =
//             Date.now() - mediaStartTimeRef.current;
//           mediaTimeElapsedOnPauseRef.current = Math.max(
//             0,
//             Math.min(slideDuration, mediaTimeElapsedOnPauseRef.current)
//           );
//         } else {
//           mediaTimeElapsedOnPauseRef.current = 0;
//         }
//       }
//       return newPausedState;
//     });
//   };

//   // Handlers for desktop click pause/resume
//   const handleMediaClick = () => {
//     togglePause();
//   };

//   const handleMediaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
//     if (e.key === "Enter" || e.key === " ") {
//       e.preventDefault();
//       togglePause();
//     }
//   };

//   // Handlers for mobile long press pause/resume
//   const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
//     e.stopPropagation();
//     e.preventDefault();
//     if (longPressTimeout.current) {
//       clearTimeout(longPressTimeout.current);
//     }
//     longPressTimeout.current = setTimeout(() => {
//       if (!isPaused) {
//         setIsPaused(true);
//         // Record current time for video when long-pressing to pause
//         if (
//           videoRef.current &&
//           highlights &&
//           typeof currentHighlightIndex === "number" &&
//           highlights[currentHighlightIndex][currentIndex].media_type === "video"
//         ) {
//           mediaTimeElapsedOnPauseRef.current =
//             videoRef.current.currentTime * 1000;
//           videoRef.current.pause();
//         } else if (mediaStartTimeRef.current !== 0) {
//           mediaTimeElapsedOnPauseRef.current =
//             Date.now() - mediaStartTimeRef.current;
//           mediaTimeElapsedOnPauseRef.current = Math.max(
//             0,
//             Math.min(slideDuration, mediaTimeElapsedOnPauseRef.current)
//           );
//         } else {
//           mediaTimeElapsedOnPauseRef.current = 0;
//         }
//       }
//     }, 500);
//   };

//   const handleTouchEnd = (
//     e: React.TouchEvent<HTMLDivElement>,
//     action: "next" | "prev"
//   ) => {
//     e.stopPropagation();
//     e.preventDefault();
//     if (longPressTimeout.current) {
//       clearTimeout(longPressTimeout.current);
//       longPressTimeout.current = null;
//     }
//     if (!isPaused) {
//       if (action === "prev") {
//         handlePreviousSlide();
//       } else {
//         handleNextSlide();
//       }
//     } else {
//       setIsPaused(false);
//       mediaTimeElapsedOnPauseRef.current = 0;
//     }
//   };

//   // Handle video metadata loaded to set current time and play
//   const handleVideoLoadedMetadata = useCallback(() => {
//     if (videoRef.current && !isPaused) {
//       // Set video's current time to where it was paused
//       videoRef.current.currentTime = mediaTimeElapsedOnPauseRef.current / 1000;
//       videoRef.current
//         .play()
//         .catch((error) => console.error("Video play failed on load:", error));
//     }
//   }, [isPaused]);

//   // Effect to ensure video plays/pauses on current index change or pause state change
//   useEffect(() => {
//     if (
//       videoRef.current &&
//       highlights &&
//       typeof currentHighlightIndex === "number"
//     ) {
//       const currentMedia = highlights[currentHighlightIndex][currentIndex];
//       if (currentMedia && currentMedia.media_type === "video") {
//         if (isPaused) {
//           videoRef.current.pause();
//         } else {
//           // Attempt to play if not paused. onLoadedMetadata will handle initial play.
//           videoRef.current
//             .play()
//             .catch((error) =>
//               console.error("Video play failed in useEffect:", error)
//             );
//         }
//       }
//     }
//   }, [currentIndex, isPaused, highlights, currentHighlightIndex]);

//   if (highlightError) {
//     return <div className="text-red-500">Error: {highlightError}</div>;
//   }

//   return (
//     highlights && (
//       <>
//         <div className="relative">
//           {/* Desktop scroll left */}
//           {showLeftArrow && (
//             <button
//               type="button"
//               onClick={() => scroll("left")}
//               className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
//             >
//               <IoChevronBack className="text-2xl text-white" />
//             </button>
//           )}

//           {/* Desktop scroll right */}
//           {showRightArrow && (
//             <button
//               type="button"
//               onClick={() => scroll("right")}
//               className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
//             >
//               <IoChevronForward className="text-2xl text-white" />
//             </button>
//           )}

//           {/* List of highlights */}
//           <ul
//             ref={scrollRef}
//             className="flex items-center overflow-x-auto scrollbar-hide"
//           >
//             {highlights.map((item, index) => {
//               const lastPost = item.length - 1;

//               return (
//                 <li key={index.toString()} className="shrink-0">
//                   <button
//                     type="button"
//                     className="m-1 rounded-full border-4 border-black flex items-center justify-center"
//                     onClick={() => {
//                       setShowHighlight(true);
//                       setCurrentHighlightIndex(index);
//                       setCurrentIndex(0);
//                       setIsPaused(false);
//                       mediaTimeElapsedOnPauseRef.current = 0;
//                       mediaStartTimeRef.current = Date.now();
//                     }}
//                   >
//                     <Image
//                       src={
//                         item[lastPost].media_type === "video"
//                           ? item[lastPost].thumbnail_url
//                           : item[lastPost].media_url
//                       }
//                       alt="Highlight"
//                       width={70}
//                       height={70}
//                       className="object-cover w-[70px] h-[70px] rounded-full m-[2px] border border-black"
//                     />
//                   </button>
//                 </li>
//               );
//             })}
//           </ul>
//         </div>

//         {showHighlight && (
//           <div className="fixed left-0 top-0 z-30 w-full h-dvh bg-black flex items-center justify-center">
//             <div className="w-[95%] absolute top-5 flex flex-col-reverse md:flex-row items-center gap-3 z-10">
//               {/* Mobile story tracker bar and user profile */}
//               <div className="self-start flex items-center gap-2">
//                 <button
//                   type="button"
//                   onClick={() => {
//                     setShowHighlight(false);
//                     setCurrentIndex(0);
//                     setIsPaused(false);
//                     mediaTimeElapsedOnPauseRef.current = 0;
//                     if (videoRef.current) {
//                       videoRef.current.pause();
//                       videoRef.current.currentTime = 0;
//                     }
//                   }}
//                 >
//                   <IoMdArrowBack className="text-xl text-white" />
//                 </button>

//                 <div className="flex items-start gap-2 md:hidden">
//                   <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

//                   <div className="text-white text-sm font-bold">
//                     <p>{username}</p>
//                   </div>
//                 </div>
//               </div>

//               <div className="w-full md:w-[90%] lg:w-[60%] md:space-y-3 mx-auto">
//                 <ul className="flex items-center gap-1">
//                   {typeof currentHighlightIndex === "number" &&
//                     highlights[currentHighlightIndex].map((item, index) => (
//                       <li
//                         key={item.id}
//                         className="w-full flex items-center h-1 rounded-full bg-white bg-opacity-50 shadow-md"
//                       >
//                         {index === currentIndex ? (
//                           <span
//                             className="bg-white h-1 animate-story"
//                             style={{
//                               animationPlayState: isPaused
//                                 ? "paused"
//                                 : "running",
//                               animationDuration: currentAnimationDuration,
//                             }}
//                           />
//                         ) : (
//                           <span
//                             className={`bg-white h-1 ${
//                               index < currentIndex ? "w-full" : "w-0"
//                             }`}
//                           />
//                         )}
//                       </li>
//                     ))}
//                 </ul>

//                 {/* Desktop user profile */}
//                 <div className="w-full flex justify-between items-center">
//                   <div className="items-start gap-2 hidden md:flex">
//                     <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

//                     <div className="text-white text-sm font-bold">
//                       <p>{username}</p>
//                     </div>
//                   </div>

//                   {/* Indicator for pause and play */}
//                   <div className="hidden md:flex">
//                     {isPaused ? (
//                       <SlControlPause className="text-white text-2xl" />
//                     ) : (
//                       <IoPlay className="text-white text-2xl" />
//                     )}
//                   </div>
//                 </div>
//               </div>
//             </div>

//             {typeof currentHighlightIndex === "number" && (
//               <div className="flex items-center h-full">
//                 {/* Desktop button for viewing previous slide */}
//                 <button
//                   type="button"
//                   onClick={(e) => {
//                     e.stopPropagation();
//                     handlePreviousSlide();
//                   }}
//                   className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
//                 >
//                   <IoChevronBack className="text-2xl text-white" />
//                 </button>

//                 {/* Desktop button for viewing next next */}
//                 <button
//                   type="button"
//                   onClick={(e) => {
//                     e.stopPropagation();
//                     handleNextSlide();
//                   }}
//                   className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
//                 >
//                   <IoChevronForward className="text-2xl text-white" />
//                 </button>

//                 {/* Media */}
//                 <div
//                   className="h-full flex items-center justify-center relative"
//                   onClick={handleMediaClick}
//                   onKeyDown={handleMediaKeyDown}
//                   tabIndex={0}
//                   // biome-ignore lint/a11y/useSemanticElements: <explanation>
//                   role="button"
//                 >
//                   {/* Moble gesture for left tap zone */}
//                   <div
//                     className="absolute touch-manipulation select-none left-0 top-0 w-1/2 h-full lg:hidden"
//                     onTouchStart={handleTouchStart}
//                     onTouchEnd={(e) => handleTouchEnd(e, "prev")}
//                   />

//                   {/* Moble gesture for right tap zone */}
//                   <div
//                     className="absolute touch-manipulation select-none right-0 top-0 w-1/2 h-full lg:hidden"
//                     onTouchStart={handleTouchStart}
//                     onTouchEnd={(e) => handleTouchEnd(e, "next")}
//                   />

//                   {isLoading ? (
//                     <div className="flex border-4 border-white border-t-transparent animate-spin rounded-full w-20 h-20" />
//                   ) : (
//                     <>
//                       {highlights[currentHighlightIndex][currentIndex]
//                         .media_type === "image" ? (
//                         <Image
//                           src={
//                             highlights[currentHighlightIndex][currentIndex]
//                               .media_url
//                           }
//                           alt="Highlight"
//                           width={700}
//                           height={700}
//                           className="object-contain cursor-pointer max-w-full max-h-full"
//                           onLoad={() => {
//                             setIsLoading(false);
//                             console.log("Image loaded");
//                           }}
//                         />
//                       ) : (
//                         <video
//                           ref={videoRef}
//                           src={
//                             highlights[currentHighlightIndex][currentIndex]
//                               .media_url
//                           }
//                           className="max-w-full max-h-full"
//                           controls={false}
//                           playsInline
//                           autoPlay
//                           onEnded={handleNextSlide}
//                           onLoadedMetadata={handleVideoLoadedMetadata}
//                           muted={false}
//                           onCanPlayThrough={() => {
//                             setIsLoading(false);
//                           }}
//                         />
//                       )}
//                     </>
//                   )}
//                 </div>
//               </div>
//             )}
//           </div>
//         )}
//       </>
//     )
//   );
// }

// "use client";

// import getUserHighlight from "@/actions/getUserHighlights";
// import { useQuery } from "@tanstack/react-query";
// import Image from "next/image";
// import { useCallback, useEffect, useRef, useState } from "react";
// import { IoMdArrowBack } from "react-icons/io";
// import { IoChevronBack, IoChevronForward, IoPlay } from "react-icons/io5";
// import { SlControlPause } from "react-icons/sl";
// import UserAvatar from "../atoms/UserAvatar";

// type HighlightProps = {
//   avatarUrl: string;
//   username: string;
// };

// const slideDuration = 3000; // Default for images in milliseconds

// export default function UserHighlights({
//   avatarUrl,
//   username,
// }: HighlightProps) {
//   const [showHighlight, setShowHighlight] = useState(false);
//   const [currentIndex, setCurrentIndex] = useState(0);
//   const [highlightError, setHighlightError] = useState<string | null>(null);
//   const [currentHighlightIndex, setCurrentHighlightIndex] = useState<
//     number | null
//   >(null);
//   const [showLeftArrow, setShowLeftArrow] = useState(false);
//   const [showRightArrow, setShowRightArrow] = useState(false);
//   const [isLoading, setIsLoading] = useState(true); // Start loading when a new media is selected
//   const [isPaused, setIsPaused] = useState(false);

//   const videoRef = useRef<HTMLVideoElement>(null);
//   const timeoutRef = useRef<NodeJS.Timeout | null>(null);
//   const scrollRef = useRef<HTMLUListElement>(null);
//   const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
//   const mediaStartTimeRef = useRef<number>(0);
//   const mediaTimeElapsedOnPauseRef = useRef<number>(0); // Time in milliseconds

//   const { data: highlights } = useQuery({
//     queryKey: ["highlights"],
//     queryFn: async () => {
//       const response = await getUserHighlight(username);

//       if (response.status !== 200 && response.message) {
//         setHighlightError(response.message);
//       }

//       return response.data;
//     },
//   });

//   // State to hold the dynamic animation duration for the current slide
//   const [currentAnimationDuration, setCurrentAnimationDuration] =
//     useState("3s");

//   // Effect to clear timeout on unmount
//   useEffect(() => {
//     return () => {
//       if (timeoutRef.current) {
//         clearTimeout(timeoutRef.current);
//       }
//     };
//   }, []);

//   // Effect for handling slide progression and media state
//   useEffect(() => {
//     if (timeoutRef.current) {
//       clearTimeout(timeoutRef.current);
//       timeoutRef.current = null;
//     }

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
//       setShowHighlight(false);
//       setCurrentIndex(0);
//       mediaTimeElapsedOnPauseRef.current = 0;
//       return;
//     }

//     // Reset loading state for the new media
//     setIsLoading(true);

//     const mediaType = currentMedia.media_type;
//     const currentMediaDuration =
//       mediaType === "video"
//         ? currentMedia.media_duration * 1000 // Ensure this is in milliseconds if media_duration is in seconds
//         : slideDuration;

//     // Set the CSS variable for the animation duration
//     setCurrentAnimationDuration(`${currentMediaDuration / 1000}s`);

//     // Logic for playing/pausing video when component mounts/updates with current index
//     if (videoRef.current) {
//       if (isPaused) {
//         videoRef.current.pause();
//       } else {
//         // We will play the video only after it's fully loaded (onLoadedMetadata/onCanPlayThrough)
//         // and if it's not paused.
//       }
//     }

//     // This return cleans up the timeout if the dependencies change before it fires.
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
//     isPaused, // Keep isPaused here to re-evaluate media playback
//     highlights,
//   ]);

//   // Effect to start the timer/video playback only when media is loaded and not paused
//   useEffect(() => {
//     if (
//       isLoading ||
//       isPaused ||
//       !showHighlight ||
//       typeof currentHighlightIndex !== "number" ||
//       !highlights
//     ) {
//       return; // Do nothing if still loading, paused, or highlight is hidden
//     }

//     const currentMedia = highlights[currentHighlightIndex][currentIndex];
//     if (!currentMedia) return;

//     const mediaType = currentMedia.media_type;
//     const currentMediaDuration =
//       mediaType === "video"
//         ? currentMedia.media_duration * 1000
//         : slideDuration;

//     // Calculate remaining time for the current media based on when it was paused
//     const remainingTime = Math.max(
//       0,
//       currentMediaDuration - mediaTimeElapsedOnPauseRef.current
//     );

//     // Reset mediaStartTimeRef when a new slide starts playing (not just paused/resumed)
//     if (!isPaused && mediaTimeElapsedOnPauseRef.current === 0) {
//       mediaStartTimeRef.current = Date.now();
//     } else if (!isPaused && mediaTimeElapsedOnPauseRef.current > 0) {
//       // If resuming from pause, adjust mediaStartTimeRef based on elapsed time
//       mediaStartTimeRef.current =
//         Date.now() - mediaTimeElapsedOnPauseRef.current;
//     }

//     if (mediaType === "image") {
//       if (timeoutRef.current) {
//         clearTimeout(timeoutRef.current);
//       }
//       timeoutRef.current = setTimeout(() => {
//         setCurrentIndex((prev) => {
//           mediaTimeElapsedOnPauseRef.current = 0; // Reset for the next slide
//           if (prev >= highlights[currentHighlightIndex].length - 1) {
//             setShowHighlight(false);
//             return 0;
//           }
//           return prev + 1;
//         });
//       }, remainingTime);
//     } else if (mediaType === "video" && videoRef.current) {
//       // The video's onLoadedMetadata/onCanPlayThrough and onEnded events will handle progression.
//       // Ensure the video plays if not paused
//       if (!isPaused) {
//         videoRef.current.currentTime =
//           mediaTimeElapsedOnPauseRef.current / 1000; // Restore time
//         videoRef.current
//           .play()
//           .catch((error) => console.error("Video play failed:", error));
//       }
//     }

//     return () => {
//       if (timeoutRef.current) {
//         clearTimeout(timeoutRef.current);
//       }
//     };
//   }, [
//     isLoading,
//     isPaused,
//     showHighlight,
//     currentHighlightIndex,
//     currentIndex,
//     highlights,
//   ]); // Dependencies for this effect

//   const scroll = (direction: "left" | "right") => {
//     const container = scrollRef.current;
//     if (!container) return;
//     const scrollAmount = container.clientWidth * 0.75;
//     container.scrollBy({
//       left: direction === "left" ? -scrollAmount : scrollAmount,
//       behavior: "smooth",
//     });
//   };

//   const checkScrollPosition = useCallback(() => {
//     const container = scrollRef.current;
//     if (container) {
//       const { scrollLeft, scrollWidth, clientWidth } = container;
//       setShowLeftArrow(scrollLeft > 0);
//       setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
//     }
//   }, []);

//   useEffect(() => {
//     const currentRef = scrollRef.current;
//     if (currentRef) {
//       currentRef.addEventListener("scroll", checkScrollPosition);
//       checkScrollPosition();
//     }
//     return () => {
//       if (currentRef) {
//         currentRef.removeEventListener("scroll", checkScrollPosition);
//       }
//     };
//   }, [checkScrollPosition]);

//   const handleNextSlide = () => {
//     if (typeof currentHighlightIndex === "number" && highlights) {
//       const posts = highlights[currentHighlightIndex];
//       mediaTimeElapsedOnPauseRef.current = 0; // Reset elapsed time for next slide
//       setIsLoading(true); // Set loading for the next slide
//       if (currentIndex >= posts.length - 1) {
//         setShowHighlight(false);
//         setCurrentIndex(0);
//       } else {
//         setCurrentIndex((prevIndex) => prevIndex + 1);
//       }
//     }
//   };

//   const handlePreviousSlide = () => {
//     if (typeof currentHighlightIndex === "number") {
//       mediaTimeElapsedOnPauseRef.current = 0; // Reset elapsed time for previous slide
//       setIsLoading(true); // Set loading for the previous slide
//       if (currentIndex <= 0) {
//         setShowHighlight(false);
//         setCurrentIndex(0);
//       } else {
//         setCurrentIndex((prevIndex) => prevIndex - 1);
//       }
//     }
//   };

//   // Function to toggle pause state and manage media playback
//   const togglePause = () => {
//     setIsPaused((prev) => {
//       const newPausedState = !prev;

//       if (!newPausedState) {
//         // Resuming from pause
//         // mediaTimeElapsedOnPauseRef.current is used to restore video time
//         // and calculate remaining image time in the main useEffect.
//         // We will reset it to 0 when moving to a new slide in handleNext/PreviousSlide.
//         // For video, play handled by the useEffect for media readiness.
//         // For image, timer will resume from remaining time.
//       } else {
//         // Pausing
//         if (
//           videoRef.current &&
//           highlights &&
//           typeof currentHighlightIndex === "number" &&
//           highlights[currentHighlightIndex][currentIndex].media_type === "video"
//         ) {
//           mediaTimeElapsedOnPauseRef.current =
//             videoRef.current.currentTime * 1000;
//           videoRef.current.pause();
//         } else if (mediaStartTimeRef.current !== 0) {
//           // For images, calculate elapsed time
//           mediaTimeElapsedOnPauseRef.current =
//             Date.now() - mediaStartTimeRef.current;
//           mediaTimeElapsedOnPauseRef.current = Math.max(
//             0,
//             Math.min(slideDuration, mediaTimeElapsedOnPauseRef.current)
//           );
//           // Clear timeout immediately for images when paused
//           if (timeoutRef.current) {
//             clearTimeout(timeoutRef.current);
//             timeoutRef.current = null;
//           }
//         } else {
//           mediaTimeElapsedOnPauseRef.current = 0;
//         }
//       }
//       return newPausedState;
//     });
//   };

//   // Handlers for desktop click pause/resume
//   const handleMediaClick = () => {
//     togglePause();
//   };

//   const handleMediaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
//     if (e.key === "Enter" || e.key === " ") {
//       e.preventDefault();
//       togglePause();
//     }
//   };

//   // Handlers for mobile long press pause/resume
//   const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
//     e.stopPropagation();
//     e.preventDefault();
//     if (longPressTimeout.current) {
//       clearTimeout(longPressTimeout.current);
//     }
//     longPressTimeout.current = setTimeout(() => {
//       if (!isPaused) {
//         // Only pause if not already paused
//         setIsPaused(true);
//       }
//     }, 500); // 500ms for long press
//   };

//   const handleTouchEnd = (
//     e: React.TouchEvent<HTMLDivElement>,
//     action: "next" | "prev"
//   ) => {
//     e.stopPropagation();
//     e.preventDefault();
//     if (longPressTimeout.current) {
//       clearTimeout(longPressTimeout.current);
//       longPressTimeout.current = null;
//     }

//     // If it was a short tap (longPressTimeout didn't trigger) and not paused, navigate
//     // If it was a long press (isPaused is true from handleTouchStart), then resume
//     if (!isPaused && Date.now() - mediaStartTimeRef.current < 500) {
//       // Check if it was a quick tap
//       if (action === "prev") {
//         handlePreviousSlide();
//       } else {
//         handleNextSlide();
//       }
//     } else if (isPaused) {
//       setIsPaused(false); // Resume playback
//     }
//   };

//   // Handle video metadata loaded to set current time and play
//   const handleVideoLoadedMetadata = useCallback(() => {
//     // This event fires when metadata has loaded, including duration.
//     // We can now attempt to play the video.
//     if (videoRef.current) {
//       setIsLoading(false); // Video metadata is loaded, stop loading indicator

//       // Only play if not paused
//       if (!isPaused) {
//         videoRef.current.currentTime =
//           mediaTimeElapsedOnPauseRef.current / 1000;
//         videoRef.current
//           .play()
//           .catch((error) => console.error("Video play failed on load:", error));
//       }
//     }
//   }, [isPaused]); // Depend on isPaused to re-evaluate play/pause behavior

//   // Handle image load
//   const handleImageLoad = useCallback(() => {
//     setIsLoading(false); // Image is loaded, stop loading indicator
//     // The main useEffect will handle the timer start for images when isLoading becomes false
//   }, []);

//   if (highlightError) {
//     return <div className="text-red-500">Error: {highlightError}</div>;
//   }

//   return (
//     highlights && (
//       <>
//         <div className="relative">
//           {/* Desktop scroll left */}
//           {showLeftArrow && (
//             <button
//               type="button"
//               onClick={() => scroll("left")}
//               className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
//             >
//               <IoChevronBack className="text-2xl text-white" />
//             </button>
//           )}

//           {/* Desktop scroll right */}
//           {showRightArrow && (
//             <button
//               type="button"
//               onClick={() => scroll("right")}
//               className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
//             >
//               <IoChevronForward className="text-2xl text-white" />
//             </button>
//           )}

//           {/* List of highlights */}
//           <ul
//             ref={scrollRef}
//             className="flex items-center overflow-x-auto scrollbar-hide"
//           >
//             {highlights.map((item, index) => {
//               const lastPost = item.length - 1;

//               return (
//                 <li key={index.toString()} className="shrink-0">
//                   <button
//                     type="button"
//                     className="m-1 rounded-full border-4 border-black flex items-center justify-center"
//                     onClick={() => {
//                       setShowHighlight(true);
//                       setCurrentHighlightIndex(index);
//                       setCurrentIndex(0);
//                       setIsPaused(false);
//                       mediaTimeElapsedOnPauseRef.current = 0;
//                       setIsLoading(true); // Important: Set loading to true when opening a new highlight
//                     }}
//                   >
//                     <Image
//                       src={
//                         item[lastPost].media_type === "video"
//                           ? item[lastPost].thumbnail_url
//                           : item[lastPost].media_url
//                       }
//                       alt="Highlight"
//                       width={70}
//                       height={70}
//                       className="object-cover w-[70px] h-[70px] rounded-full m-[2px] border border-black"
//                     />
//                   </button>
//                 </li>
//               );
//             })}
//           </ul>
//         </div>

//         {showHighlight && (
//           <div className="fixed left-0 top-0 z-30 w-full h-dvh bg-black flex items-center justify-center">
//             <div className="w-[95%] absolute top-5 flex flex-col-reverse md:flex-row items-center gap-3 z-10">
//               {/* Mobile story tracker bar and user profile */}
//               <div className="self-start flex items-center gap-2">
//                 <button
//                   type="button"
//                   onClick={() => {
//                     setShowHighlight(false);
//                     setCurrentIndex(0);
//                     setIsPaused(false);
//                     mediaTimeElapsedOnPauseRef.current = 0;
//                     setIsLoading(true); // Reset loading state
//                     if (videoRef.current) {
//                       videoRef.current.pause();
//                       videoRef.current.currentTime = 0;
//                     }
//                   }}
//                 >
//                   <IoMdArrowBack className="text-xl text-white" />
//                 </button>

//                 <div className="flex items-start gap-2 md:hidden">
//                   <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

//                   <div className="text-white text-sm font-bold">
//                     <p>{username}</p>
//                   </div>
//                 </div>
//               </div>

//               <div className="w-full md:w-[90%] lg:w-[60%] md:space-y-3 mx-auto">
//                 <ul className="flex items-center gap-1">
//                   {typeof currentHighlightIndex === "number" &&
//                     highlights[currentHighlightIndex].map((item, index) => (
//                       <li
//                         key={item.id}
//                         className="w-full flex items-center h-1 rounded-full bg-white bg-opacity-50 shadow-md"
//                       >
//                         {index === currentIndex ? (
//                           <span
//                             className="bg-white h-1 animate-story"
//                             style={{
//                               animationPlayState:
//                                 isLoading || isPaused ? "paused" : "running",
//                               animationDuration: currentAnimationDuration,
//                               // Calculate animation delay for resuming from pause
//                               animationDelay: isLoading
//                                 ? "0s"
//                                 : `-${
//                                     mediaTimeElapsedOnPauseRef.current / 1000
//                                   }s`,
//                             }}
//                           />
//                         ) : (
//                           <span
//                             className={`bg-white h-1 ${
//                               index < currentIndex ? "w-full" : "w-0"
//                             }`}
//                           />
//                         )}
//                       </li>
//                     ))}
//                 </ul>

//                 {/* Desktop user profile */}
//                 <div className="w-full flex justify-between items-center">
//                   <div className="items-start gap-2 hidden md:flex">
//                     <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

//                     <div className="text-white text-sm font-bold">
//                       <p>{username}</p>
//                     </div>
//                   </div>

//                   {/* Indicator for pause and play */}
//                   <div className="hidden md:flex">
//                     {isPaused || isLoading ? ( // Show pause/loading icon if paused or loading
//                       <SlControlPause className="text-white text-2xl" />
//                     ) : (
//                       <IoPlay className="text-white text-2xl" />
//                     )}
//                   </div>
//                 </div>
//               </div>
//             </div>

//             {typeof currentHighlightIndex === "number" && (
//               <div className="flex items-center h-full">
//                 {/* Desktop button for viewing previous slide */}
//                 <button
//                   type="button"
//                   onClick={(e) => {
//                     e.stopPropagation();
//                     handlePreviousSlide();
//                   }}
//                   className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
//                 >
//                   <IoChevronBack className="text-2xl text-white" />
//                 </button>

//                 {/* Desktop button for viewing next next */}
//                 <button
//                   type="button"
//                   onClick={(e) => {
//                     e.stopPropagation();
//                     handleNextSlide();
//                   }}
//                   className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
//                 >
//                   <IoChevronForward className="text-2xl text-white" />
//                 </button>

//                 {/* Media */}
//                 <div
//                   className="h-full flex items-center justify-center relative"
//                   onClick={handleMediaClick}
//                   onKeyDown={handleMediaKeyDown}
//                   tabIndex={0}
//                   role="button"
//                 >
//                   {/* Moble gesture for left tap zone */}
//                   <div
//                     className="absolute touch-manipulation select-none left-0 top-0 w-1/2 h-full lg:hidden"
//                     onTouchStart={handleTouchStart}
//                     onTouchEnd={(e) => handleTouchEnd(e, "prev")}
//                   />

//                   {/* Moble gesture for right tap zone */}
//                   <div
//                     className="absolute touch-manipulation select-none right-0 top-0 w-1/2 h-full lg:hidden"
//                     onTouchStart={handleTouchStart}
//                     onTouchEnd={(e) => handleTouchEnd(e, "next")}
//                   />

//                   {isLoading && (
//                     <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-20">
//                       <div className="flex border-4 border-white border-t-transparent animate-spin rounded-full w-20 h-20" />
//                     </div>
//                   )}

//                   {highlights[currentHighlightIndex][currentIndex]
//                     .media_type === "image" ? (
//                     <Image
//                       src={
//                         highlights[currentHighlightIndex][currentIndex]
//                           .media_url
//                       }
//                       alt="Highlight"
//                       width={700}
//                       height={700}
//                       className="object-contain cursor-pointer max-w-full max-h-full"
//                       onLoad={handleImageLoad} // Call new handler for image load
//                     />
//                   ) : (
//                     <video
//                       ref={videoRef}
//                       src={
//                         highlights[currentHighlightIndex][currentIndex]
//                           .media_url
//                       }
//                       className="max-w-full max-h-full"
//                       controls={false}
//                       playsInline
//                       autoPlay={!isPaused} // Only autoplay if not paused initially
//                       onEnded={handleNextSlide}
//                       // Use onLoadedMetadata or onCanPlayThrough for video readiness
//                       onLoadedMetadata={handleVideoLoadedMetadata}
//                       // onCanPlayThrough={handleVideoLoadedMetadata} // Consider this for stricter readiness
//                       muted={false}
//                       // onCanPlayThrough already calls setIsLoading(false) implicitly via handleVideoLoadedMetadata
//                     />
//                   )}
//                 </div>
//               </div>
//             )}
//           </div>
//         )}
//       </>
//     )
//   );
// }

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

const slideDuration = 3000; // Default for images in milliseconds

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
  const [isLoading, setIsLoading] = useState(true); // Start loading when a new media is selected
  const [isPaused, setIsPaused] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLUListElement>(null);
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);
  const mediaStartTimeRef = useRef<number>(0);
  const mediaTimeElapsedOnPauseRef = useRef<number>(0); // Time in milliseconds

  const { data: highlights } = useQuery({
    queryKey: ["highlights"],
    queryFn: async () => {
      const response = await getUserHighlight(username);

      if (response.status !== 200 && response.message) {
        setHighlightError(response.message);
      }

      return response.data;
    },
  });

  // State to hold the dynamic animation duration for the current slide
  const [currentAnimationDuration, setCurrentAnimationDuration] =
    useState("3s");

  // Effect to clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Effect for handling slide progression and media state
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
      setShowHighlight(false);
      setCurrentIndex(0);
      mediaTimeElapsedOnPauseRef.current = 0;
      return;
    }

    // Always set loading to true when currentMedia or currentIndex changes
    // This ensures the spinner shows when a new slide is being prepared.
    setIsLoading(true);

    const mediaType = currentMedia.media_type;
    const currentMediaDuration =
      mediaType === "video"
        ? currentMedia.media_duration * 1000
        : slideDuration;

    // Set the CSS variable for the animation duration
    setCurrentAnimationDuration(`${currentMediaDuration / 1000}s`);

    // Logic for playing/pausing video when component mounts/updates with current index
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      }
    }

    // This return cleans up the timeout if the dependencies change before it fires.
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
    highlights,
    isPaused,
  ]);

  // Effect to start the timer/video playback only when media is loaded and not paused
  useEffect(() => {
    if (
      isLoading || // Still loading, so don't start timer/playback
      isPaused ||
      !showHighlight ||
      typeof currentHighlightIndex !== "number" ||
      !highlights
    ) {
      return; // Do nothing if still loading, paused, or highlight is hidden
    }

    const currentMedia = highlights[currentHighlightIndex][currentIndex];
    if (!currentMedia) return;

    const mediaType = currentMedia.media_type;
    const currentMediaDuration =
      mediaType === "video"
        ? currentMedia.media_duration * 1000
        : slideDuration;

    // Calculate remaining time for the current media based on when it was paused
    const remainingTime = Math.max(
      0,
      currentMediaDuration - mediaTimeElapsedOnPauseRef.current,
    );

    // Reset mediaStartTimeRef when a new slide starts playing (not just paused/resumed)
    if (!isPaused && mediaTimeElapsedOnPauseRef.current === 0) {
      mediaStartTimeRef.current = Date.now();
    } else if (!isPaused && mediaTimeElapsedOnPauseRef.current > 0) {
      // If resuming from pause, adjust mediaStartTimeRef based on elapsed time
      mediaStartTimeRef.current =
        Date.now() - mediaTimeElapsedOnPauseRef.current;
    }

    if (mediaType === "image") {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
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
    } else if (mediaType === "video" && videoRef.current) {
      // The video's onLoadedMetadata/onCanPlayThrough and onEnded events will handle progression.
      // Ensure the video plays if not paused
      if (!isPaused) {
        videoRef.current.currentTime =
          mediaTimeElapsedOnPauseRef.current / 1000; // Restore time
        videoRef.current
          .play()
          .catch((error) => console.error("Video play failed:", error));
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    isLoading, // Keep isLoading here as a dependency
    isPaused,
    showHighlight,
    currentHighlightIndex,
    currentIndex,
    highlights,
  ]); // Dependencies for this effect

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
      checkScrollPosition();
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
      mediaTimeElapsedOnPauseRef.current = 0; // Reset elapsed time for next slide
      setIsLoading(true); // Set loading for the next slide
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
      mediaTimeElapsedOnPauseRef.current = 0; // Reset elapsed time for previous slide
      setIsLoading(true); // Set loading for the previous slide
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
        // Resuming from pause
        // mediaTimeElapsedOnPauseRef.current is used to restore video time
        // and calculate remaining image time in the main useEffect.
        // We will reset it to 0 when moving to a new slide in handleNext/PreviousSlide.
        // For video, play handled by the useEffect for media readiness.
        // For image, timer will resume from remaining time.
      } else {
        // Pausing
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
          // For images, calculate elapsed time
          mediaTimeElapsedOnPauseRef.current =
            Date.now() - mediaStartTimeRef.current;
          mediaTimeElapsedOnPauseRef.current = Math.max(
            0,
            Math.min(slideDuration, mediaTimeElapsedOnPauseRef.current),
          );
          // Clear timeout immediately for images when paused
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
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
    e.preventDefault();
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
    }
    longPressTimeout.current = setTimeout(() => {
      if (!isPaused) {
        // Only pause if not already paused
        setIsPaused(true);
      }
    }, 500); // 500ms for long press
  };

  const handleTouchEnd = (
    e: React.TouchEvent<HTMLDivElement>,
    action: "next" | "prev",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }

    // If it was a short tap (longPressTimeout didn't trigger) and not paused, navigate
    // If it was a long press (isPaused is true from handleTouchStart), then resume
    if (!isPaused && Date.now() - mediaStartTimeRef.current < 500) {
      // Check if it was a quick tap
      if (action === "prev") {
        handlePreviousSlide();
      } else {
        handleNextSlide();
      }
    } else if (isPaused) {
      setIsPaused(false); // Resume playback
    }
  };

  // Handle video metadata loaded to set current time and play
  const handleVideoLoadedMetadata = useCallback(() => {
    // This event fires when metadata has loaded, including duration.
    // We can now attempt to play the video.
    if (videoRef.current) {
      setIsLoading(false); // Video metadata is loaded, stop loading indicator

      // Only play if not paused
      if (!isPaused) {
        videoRef.current.currentTime =
          mediaTimeElapsedOnPauseRef.current / 1000;
        videoRef.current
          .play()
          .catch((error) => console.error("Video play failed on load:", error));
      }
    }
  }, [isPaused]); // Depend on isPaused to re-evaluate play/pause behavior

  // Handle image load
  const handleImageLoad = useCallback(() => {
    setIsLoading(false); // Image is loaded, stop loading indicator
    // The main useEffect will handle the timer start for images when isLoading becomes false
  }, []);

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
                      setIsLoading(true); // Important: Set loading to true when opening a new highlight
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
                    setIsLoading(true); // Reset loading state
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
                              animationPlayState:
                                isLoading || isPaused ? "paused" : "running",
                              animationDuration: currentAnimationDuration,
                              // Calculate animation delay for resuming from pause
                              animationDelay: isLoading
                                ? "0s"
                                : `-${
                                    mediaTimeElapsedOnPauseRef.current / 1000
                                  }s`,
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
                    {/* Show pause icon if paused, otherwise play icon */}
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
                    className="absolute touch-manipulation select-none left-0 top-0 w-1/2 h-full lg:hidden"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={(e) => handleTouchEnd(e, "prev")}
                  />

                  {/* Moble gesture for right tap zone */}
                  <div
                    className="absolute touch-manipulation select-none right-0 top-0 w-1/2 h-full lg:hidden"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={(e) => handleTouchEnd(e, "next")}
                  />

                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-20">
                      <div className="flex border-4 border-white border-t-transparent animate-spin rounded-full w-20 h-20" />
                    </div>
                  )}

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
                      onLoad={handleImageLoad} // Call new handler for image load
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
                      autoPlay={!isPaused} // Only autoplay if not paused initially
                      onEnded={handleNextSlide}
                      // Use onLoadedMetadata or onCanPlayThrough for video readiness
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      // onCanPlayThrough={handleVideoLoadedMetadata} // Consider this for stricter readiness
                      muted={false}
                      // onCanPlayThrough already calls setIsLoading(false) implicitly via handleVideoLoadedMetadata
                    />
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
