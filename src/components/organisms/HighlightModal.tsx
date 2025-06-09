import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "../ui/button";

type closePopupModalType = {
  handleShowHighlightModal: (state: boolean) => void;
};

export default function HighlightModal({
  handleShowHighlightModal,
}: closePopupModalType) {
  const [highlightsPreview, setHighlightsPreview] = useState<string[] | null>(
    null,
  );

  const [selectedFiles, setSelectedFiles] = useState<File[] | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadButton = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    if (files && files.length > 0) {
      const selected = Array.from(files);
      const previews = selected.map((file) => URL.createObjectURL(file));
      setHighlightsPreview(previews);
      setSelectedFiles(selected);
      setStep((prevStep) => prevStep + 1);
    }
  };

  const handleUpload = async () => {
    if (!selectedFiles) {
      alert("Please select a file first!");
      return;
    }

    setIsUploading(true);

    // try {
    //   await saveAvatarToCloudinary(selectedFiles);
    //   alert("Upload successful!");
    //   handleShowHighlightModal(false);
    // } catch (error) {
    //   console.error("Error uploading image:", error);
    //   alert("Upload failed. Please try again.");
    // } finally {
    //   setIsUploading(false);
    // }
  };

  return (
    <div className="w-full h-dvh fixed left-0 top-0 bg-black bg-opacity-50 justify-center items-center z-30 flex">
      {/* cancel button */}
      <button
        type="button"
        className="absolute top-5 right-5 hidden md:flex"
        onClick={() => handleShowHighlightModal(false)}
      >
        <Image
          src="/assets/images/circularCancel.svg"
          alt="Cancel"
          width={40}
          height={40}
          className="filter invert"
        />
      </button>

      {/* Inner popup */}

      <div className="flex flex-col items-center justify-start bg-white w-full h-[95%] mt-auto md:mt-0 md:w-[60%] lg:w-[45%] md:h-[75%] rounded-t-2xl md:rounded-2xl py-3">
        <div className="w-full">
          {step === 1 && (
            <div className="flex justify-end items-center px-4 md:px-0">
              <h1 className="text-gray-500 font-bold text-center pb-1 text-lg mx-auto">
                New Higlight
              </h1>

              <button
                type="button"
                className="md:hidden"
                onClick={() => handleShowHighlightModal(false)}
              >
                <Image
                  src="/assets/images/circularCancel.svg"
                  alt="Cancel"
                  width={25}
                  height={25}
                />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex justify-between w-[90%] mx-auto">
              <button
                type="button"
                onClick={() => setStep((prevStep) => prevStep - 1)}
              >
                <Image
                  src="/assets/images/moveBack.svg"
                  alt="Back"
                  width={30}
                  height={30}
                />
              </button>

              <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                Upload Highlight
              </h1>

              <button
                type="button"
                className="font-bold"
                onClick={() => setStep((prevStep) => prevStep + 1)}
              >
                Next
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex justify-between w-[90%] mx-auto">
              <button
                type="button"
                onClick={() => setStep((prevStep) => prevStep - 1)}
              >
                <Image
                  src="/assets/images/moveBack.svg"
                  alt="Back"
                  width={30}
                  height={30}
                />
              </button>

              <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                Upload Highlight
              </h1>

              <button
                type="button"
                className="font-bold"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          )}

          <hr />
        </div>

        {step === 1 && (
          <div className="flex flex-col items-center gap-5 my-auto">
            <div className="flex flex-col items-center">
              <Image
                src="/assets/images/gallery.svg"
                alt="Gallery"
                width={100}
                height={100}
              />
              <p className="text-lg">Upload highlights here</p>
            </div>

            <input
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              ref={fileInputRef}
              onChange={handleFileChange}
            />

            <Button
              className="p-6 text-lg rounded-xl"
              onClick={handleUploadButton}
            >
              Upload
            </Button>
          </div>
        )}

        {step === 2 && highlightsPreview && (
          // className="grid grid-cols-2 md:grid-cols-3 gap-1 mt-5 w-[90%] overflow-auto max-h-[90%]"
          <div className="flex items-center h-full md:w-1/2">
            {highlightsPreview.map((preview, index) => {
              const file = selectedFiles?.[index];
              const isVideo = file?.type.startsWith("video");

              return isVideo ? (
                <video
                  key={preview}
                  src={preview}
                  controls
                  className="w-full h-full"
                >
                  <track
                    kind="captions"
                    srcLang="en"
                    label="English"
                    //   src="/path-to-your-captions.vtt"
                    default
                  />
                </video>
              ) : (
                <Image
                  key={preview}
                  src={preview}
                  alt={`Preview ${index}`}
                  width={300}
                  height={300}
                  className="w-full object-cover"
                />
              );
            })}
          </div>
        )}

        {step === 3 && highlightsPreview && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1 mt-5 w-[90%] overflow-auto max-h-[90%]">
            {highlightsPreview.map((preview, index) => {
              const file = selectedFiles?.[index];
              const isVideo = file?.type.startsWith("video");

              return isVideo ? (
                <video
                  key={preview}
                  src={preview}
                  controls
                  className="h-64 object-cover"
                >
                  <track
                    kind="captions"
                    srcLang="en"
                    label="English"
                    //   src="/path-to-your-captions.vtt"
                    default
                  />
                </video>
              ) : (
                <Image
                  key={preview}
                  src={preview}
                  alt={`Preview ${index}`}
                  width={300}
                  height={300}
                  className="h-64"
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// import Image from "next/image";
// import { useRef, useState, useEffect } from "react";
// import { Button } from "../ui/button";
// import {
//   CrossIcon,
//   ChevronLeftIcon,
//   ChevronRightIcon,
//   PlayIcon,
//   PauseIcon,
//   Volume2Icon,
//   VolumeXIcon,
//   Trash2Icon,
// } from "lucide-react";

// type ClosePopupModalType = {
//   handleShowHighlightModal: (state: boolean) => void;
// };

// type MediaItem = {
//   url: string;
//   file: File;
//   type: "image" | "video";
//   duration?: number;
// };

// export default function HighlightModal({
//   handleShowHighlightModal,
// }: ClosePopupModalType) {
//   const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
//   const [currentIndex, setCurrentIndex] = useState(0);
//   const [isUploading, setIsUploading] = useState(false);
//   const [step, setStep] = useState(1);
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [isMuted, setIsMuted] = useState(false);
//   const [videoProgress, setVideoProgress] = useState(0);
//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const touchStartX = useRef(0);
//   const touchEndX = useRef(0);

//   // Handle swipe gestures for mobile
//   const handleTouchStart = (e: React.TouchEvent) => {
//     touchStartX.current = e.touches[0].clientX;
//   };

//   const handleTouchMove = (e: React.TouchEvent) => {
//     touchEndX.current = e.touches[0].clientX;
//   };

//   const handleTouchEnd = () => {
//     if (touchStartX.current - touchEndX.current > 50) {
//       // Swipe left
//       handleNext();
//     } else if (touchEndX.current - touchStartX.current > 50) {
//       // Swipe right
//       handlePrevious();
//     }
//   };

//   // Video controls
//   const togglePlayPause = () => {
//     if (videoRef.current) {
//       if (isPlaying) {
//         videoRef.current.pause();
//       } else {
//         videoRef.current.play();
//       }
//       setIsPlaying(!isPlaying);
//     }
//   };

//   const toggleMute = () => {
//     if (videoRef.current) {
//       videoRef.current.muted = !isMuted;
//       setIsMuted(!isMuted);
//     }
//   };

//   const handleVideoProgress = () => {
//     if (videoRef.current) {
//       const progress =
//         (videoRef.current.currentTime / videoRef.current.duration) * 100;
//       setVideoProgress(progress);
//     }
//   };

//   const handleVideoEnded = () => {
//     setIsPlaying(false);
//     if (currentIndex < mediaItems.length - 1) {
//       setTimeout(() => {
//         setCurrentIndex(currentIndex + 1);
//       }, 500);
//     }
//   };

//   // Handle file selection
//   const handleFileChange = async (
//     event: React.ChangeEvent<HTMLInputElement>
//   ) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     const newMediaItems: MediaItem[] = [];

//     for (let i = 0; i < files.length; i++) {
//       const file = files[i];
//       const url = URL.createObjectURL(file);

//       if (file.type.startsWith("video")) {
//         // Get video duration
//         const duration = await getVideoDuration(url);
//         newMediaItems.push({ url, file, type: "video", duration });
//       } else {
//         newMediaItems.push({ url, file, type: "image" });
//       }
//     }

//     setMediaItems(newMediaItems);
//     setStep(2);
//   };

//   const getVideoDuration = (url: string): Promise<number> => {
//     return new Promise((resolve) => {
//       const video = document.createElement("video");
//       video.src = url;
//       video.onloadedmetadata = () => {
//         resolve(video.duration);
//       };
//     });
//   };

//   // Navigation functions
//   const handleNext = () => {
//     if (currentIndex < mediaItems.length - 1) {
//       setCurrentIndex(currentIndex + 1);
//       setIsPlaying(false);
//     }
//   };

//   const handlePrevious = () => {
//     if (currentIndex > 0) {
//       setCurrentIndex(currentIndex - 1);
//       setIsPlaying(false);
//     }
//   };

//   // Delete current media item
//   const handleDelete = () => {
//     if (mediaItems.length === 1) {
//       handleShowHighlightModal(false);
//       return;
//     }

//     const newMediaItems = [...mediaItems];
//     newMediaItems.splice(currentIndex, 1);
//     setMediaItems(newMediaItems);

//     if (currentIndex >= newMediaItems.length) {
//       setCurrentIndex(newMediaItems.length - 1);
//     }
//   };

//   // Clean up object URLs
//   useEffect(() => {
//     return () => {
//       mediaItems.forEach((item) => URL.revokeObjectURL(item.url));
//     };
//   }, [mediaItems]);

//   // Reset video state when current item changes
//   useEffect(() => {
//     setIsPlaying(false);
//     setVideoProgress(0);
//   }, [currentIndex]);

//   const currentMedia = mediaItems[currentIndex];

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center">
//       {/* Header */}
//       <div className="w-full flex justify-between items-center p-4 absolute top-0 z-10">
//         <button
//           type="button"
//           onClick={() =>
//             step === 1 ? handleShowHighlightModal(false) : setStep(step - 1)
//           }
//           className="text-white p-2"
//         >
//           {step === 1 ? (
//             <CrossIcon className="w-6 h-6" />
//           ) : (
//             <ChevronLeftIcon className="w-6 h-6" />
//           )}
//         </button>

//         <h2 className="text-white font-semibold text-lg">
//           {step === 1 ? "New Highlight" : "Upload Highlight"}
//         </h2>

//         {step === 2 && (
//           <button
//             type="button"
//             onClick={() => setStep(3)}
//             className="text-blue-500 font-semibold"
//           >
//             Next
//           </button>
//         )}

//         {step === 3 && (
//           <button
//             type="button"
//             onClick={() => {
//               /* Handle upload */
//             }}
//             className="text-blue-500 font-semibold"
//             disabled={isUploading}
//           >
//             {isUploading ? "Uploading..." : "Upload"}
//           </button>
//         )}
//       </div>

//       {/* Main Content */}
//       <div className="w-full h-full flex flex-col items-center justify-center relative">
//         {step === 1 && (
//           <div className="flex flex-col items-center gap-8 p-6 text-center">
//             <div className="bg-gray-800 p-6 rounded-full">
//               <Image
//                 src="/assets/images/gallery.svg"
//                 alt="Gallery"
//                 width={60}
//                 height={60}
//                 className="filter invert"
//               />
//             </div>
//             <h3 className="text-white text-xl font-medium">
//               Upload highlights here
//             </h3>
//             <input
//               type="file"
//               accept="image/*,video/*"
//               multiple
//               hidden
//               ref={fileInputRef}
//               onChange={handleFileChange}
//             />
//             <Button
//               className="px-8 py-6 text-lg rounded-xl bg-blue-600 hover:bg-blue-700"
//               onClick={() => fileInputRef.current?.click()}
//             >
//               Select from Gallery
//             </Button>
//           </div>
//         )}

//         {step === 2 && mediaItems.length > 0 && (
//           <div
//             className="w-full h-full flex items-center justify-center relative"
//             onTouchStart={handleTouchStart}
//             onTouchMove={handleTouchMove}
//             onTouchEnd={handleTouchEnd}
//           >
//             {/* Desktop navigation buttons */}
//             <div className="hidden md:flex absolute inset-y-0 left-0 items-center justify-start pl-4 z-20">
//               <button
//                 type="button"
//                 onClick={handlePrevious}
//                 disabled={currentIndex === 0}
//                 className={`p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                   currentIndex === 0 ? "opacity-50" : "hover:bg-opacity-70"
//                 }`}
//               >
//                 <ChevronLeftIcon className="w-8 h-8" />
//               </button>
//             </div>

//             {/* Media display */}
//             <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative w-full h-full flex items-center justify-center">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="max-w-full max-h-full"
//                     onClick={togglePlayPause}
//                     onTimeUpdate={handleVideoProgress}
//                     onEnded={handleVideoEnded}
//                     muted={isMuted}
//                   />

//                   {/* Video controls overlay */}
//                   <div className="absolute inset-0 flex items-center justify-center">
//                     {!isPlaying && (
//                       <button
//                         type="button"
//                         onClick={togglePlayPause}
//                         className="p-4 bg-black bg-opacity-50 rounded-full"
//                       >
//                         <PlayIcon className="w-10 h-10 text-white" />
//                       </button>
//                     )}
//                   </div>

//                   {/* Video duration indicator */}
//                   <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
//                     {formatDuration(currentMedia.duration || 0)}
//                   </div>

//                   {/* Mute button */}
//                   <button
//                     type="button"
//                     onClick={toggleMute}
//                     className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-full"
//                   >
//                     {isMuted ? (
//                       <VolumeXIcon className="w-5 h-5 text-white" />
//                     ) : (
//                       <Volume2Icon className="w-5 h-5 text-white" />
//                     )}
//                   </button>

//                   {/* Video progress bar */}
//                   <div className="absolute bottom-20 left-0 right-0 h-1 bg-gray-600 mx-4">
//                     <div
//                       className="h-full bg-blue-500"
//                       style={{ width: `${videoProgress}%` }}
//                     />
//                   </div>
//                 </div>
//               )}

//               {/* Delete button */}
//               <button
//                 type="button"
//                 onClick={handleDelete}
//                 className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full"
//               >
//                 <Trash2Icon className="w-5 h-5" />
//               </button>
//             </div>

//             {/* Desktop navigation buttons */}
//             <div className="hidden md:flex absolute inset-y-0 right-0 items-center justify-end pr-4 z-20">
//               <button
//                 type="button"
//                 onClick={handleNext}
//                 disabled={currentIndex === mediaItems.length - 1}
//                 className={`p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                   currentIndex === mediaItems.length - 1
//                     ? "opacity-50"
//                     : "hover:bg-opacity-70"
//                 }`}
//               >
//                 <ChevronRightIcon className="w-8 h-8" />
//               </button>
//             </div>
//           </div>
//         )}

//         {step === 3 && mediaItems.length > 0 && (
//           <div className="w-full h-full flex flex-col">
//             <div className="flex-1 flex items-center justify-center relative">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative w-full h-full flex items-center justify-center">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="max-w-full max-h-full"
//                     controls
//                   />
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         {/* Thumbnail strip */}
//         {(step === 2 || step === 3) && mediaItems.length > 0 && (
//           <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
//             <div className="flex gap-2 overflow-x-auto py-2">
//               {mediaItems.map((item, index) => (
//                 <button
//                   type="button"
//                   key={index.toString()}
//                   onClick={() => setCurrentIndex(index)}
//                   className={`relative w-16 h-16 rounded-md overflow-hidden ${
//                     currentIndex === index
//                       ? "ring-2 ring-blue-500"
//                       : "opacity-70"
//                   }`}
//                 >
//                   {item.type === "image" ? (
//                     <Image
//                       src={item.url}
//                       alt="Thumbnail"
//                       fill
//                       className="object-cover"
//                     />
//                   ) : (
//                     <>
//                       <video
//                         src={item.url}
//                         className="w-full h-full object-cover"
//                       />
//                       <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
//                         {formatDuration(item.duration || 0)}
//                       </div>
//                     </>
//                   )}
//                 </button>
//               ))}
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // Helper function to format duration (seconds to MM:SS)
// function formatDuration(duration: number): string {
//   const minutes = Math.floor(duration / 60);
//   const seconds = Math.floor(duration % 60);
//   return `${minutes}:${seconds.toString().padStart(2, "0")}`;
// }

// import Image from "next/image";
// import { useRef, useState, useEffect } from "react";
// import { Button } from "../ui/button";
// import {
//   CrossIcon,
//   ChevronLeftIcon,
//   ChevronRightIcon,
//   PlayIcon,
//   PauseIcon,
//   Volume2Icon,
//   VolumeXIcon,
//   Trash2Icon,
//   ScissorsIcon,
// } from "lucide-react";

// type ClosePopupModalType = {
//   handleShowHighlightModal: (state: boolean) => void;
// };

// type MediaItem = {
//   url: string;
//   file: File;
//   type: "image" | "video";
//   duration?: number;
//   startTime?: number;
//   endTime?: number;
// };

// export default function HighlightModal({
//   handleShowHighlightModal,
// }: ClosePopupModalType) {
//   const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
//   const [currentIndex, setCurrentIndex] = useState(0);
//   const [isUploading, setIsUploading] = useState(false);
//   const [step, setStep] = useState(1);
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [isMuted, setIsMuted] = useState(false);
//   const [videoProgress, setVideoProgress] = useState(0);
//   const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
//   const [trimStart, setTrimStart] = useState(0);
//   const [trimEnd, setTrimEnd] = useState(0);
//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const videoTrimmerRef = useRef<HTMLVideoElement>(null);
//   const touchStartX = useRef(0);
//   const touchEndX = useRef(0);

//   const currentMedia = mediaItems[currentIndex];

//   // Handle swipe gestures for mobile
//   const handleTouchStart = (e: React.TouchEvent) => {
//     touchStartX.current = e.touches[0].clientX;
//   };

//   const handleTouchMove = (e: React.TouchEvent) => {
//     touchEndX.current = e.touches[0].clientX;
//   };

//   const handleTouchEnd = () => {
//     if (touchStartX.current - touchEndX.current > 50) {
//       handleNext();
//     } else if (touchEndX.current - touchStartX.current > 50) {
//       handlePrevious();
//     }
//   };

//   // Video controls
//   const togglePlayPause = () => {
//     if (videoRef.current) {
//       if (isPlaying) {
//         videoRef.current.pause();
//       } else {
//         videoRef.current.play();
//       }
//       setIsPlaying(!isPlaying);
//     }
//   };

//   const toggleMute = () => {
//     if (videoRef.current) {
//       videoRef.current.muted = !isMuted;
//       setIsMuted(!isMuted);
//     }
//   };

//   const handleVideoProgress = () => {
//     if (videoRef.current) {
//       const progress =
//         (videoRef.current.currentTime / videoRef.current.duration) * 100;
//       setVideoProgress(progress);
//     }
//   };

//   const handleVideoEnded = () => {
//     setIsPlaying(false);
//     if (currentIndex < mediaItems.length - 1) {
//       setTimeout(() => {
//         setCurrentIndex(currentIndex + 1);
//       }, 500);
//     }
//   };

//   // Handle file selection
//   const handleFileChange = async (
//     event: React.ChangeEvent<HTMLInputElement>
//   ) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     const newMediaItems: MediaItem[] = [];

//     for (let i = 0; i < files.length; i++) {
//       const file = files[i];
//       const url = URL.createObjectURL(file);

//       if (file.type.startsWith("video")) {
//         const duration = await getVideoDuration(url);
//         newMediaItems.push({
//           url,
//           file,
//           type: "video",
//           duration,
//           startTime: 0,
//           endTime: duration,
//         });
//       } else {
//         newMediaItems.push({ url, file, type: "image" });
//       }
//     }

//     setMediaItems(newMediaItems);
//     setStep(2);
//   };

//   const getVideoDuration = (url: string): Promise<number> => {
//     return new Promise((resolve) => {
//       const video = document.createElement("video");
//       video.src = url;
//       video.onloadedmetadata = () => {
//         resolve(video.duration);
//       };
//     });
//   };

//   // Navigation functions
//   const handleNext = () => {
//     if (currentIndex < mediaItems.length - 1) {
//       setCurrentIndex(currentIndex + 1);
//       setIsPlaying(false);
//     }
//   };

//   const handlePrevious = () => {
//     if (currentIndex > 0) {
//       setCurrentIndex(currentIndex - 1);
//       setIsPlaying(false);
//     }
//   };

//   // Delete media item
//   const handleDelete = (index: number) => {
//     if (mediaItems.length === 1) {
//       handleShowHighlightModal(false);
//       return;
//     }

//     const newMediaItems = [...mediaItems];
//     newMediaItems.splice(index, 1);
//     setMediaItems(newMediaItems);

//     if (currentIndex >= newMediaItems.length) {
//       setCurrentIndex(newMediaItems.length - 1);
//     }
//   };

//   // Video trimming functions
//   const toggleVideoTrimmer = () => {
//     setShowVideoTrimmer(!showVideoTrimmer);
//     if (videoRef.current && !showVideoTrimmer) {
//       setTrimStart(0);
//       setTrimEnd(videoRef.current.duration);
//     }
//   };

//   const handleTrimStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const newStart = Number.parseFloat(e.target.value);
//     setTrimStart(newStart);
//     if (videoRef.current) {
//       videoRef.current.currentTime = newStart;
//     }
//   };

//   const handleTrimEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const newEnd = Number.parseFloat(e.target.value);
//     setTrimEnd(newEnd);
//   };

//   const applyTrim = () => {
//     if (videoRef.current && currentMedia.type === "video") {
//       const updatedMediaItems = [...mediaItems];
//       updatedMediaItems[currentIndex] = {
//         ...updatedMediaItems[currentIndex],
//         startTime: trimStart,
//         endTime: trimEnd,
//       };
//       setMediaItems(updatedMediaItems);
//       setShowVideoTrimmer(false);
//     }
//   };

//   // Clean up object URLs
//   useEffect(() => {
//     return () => {
//       mediaItems.forEach((item) => URL.revokeObjectURL(item.url));
//     };
//   }, [mediaItems]);

//   // Reset video state when current item changes
//   useEffect(() => {
//     setIsPlaying(false);
//     setVideoProgress(0);
//     setShowVideoTrimmer(false);
//   }, [currentIndex]);

//   // Initialize trim values when video changes
//   useEffect(() => {
//     if (currentMedia?.type === "video") {
//       setTrimStart(currentMedia.startTime || 0);
//       setTrimEnd(currentMedia.endTime || currentMedia.duration || 0);
//     }
//   }, [currentMedia]);

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center">
//       {/* Header */}
//       <div className="w-full flex justify-between items-center p-4 absolute top-0 z-10">
//         <button
//           type="button"
//           onClick={() =>
//             step === 1 ? handleShowHighlightModal(false) : setStep(step - 1)
//           }
//           className="text-white p-2"
//         >
//           {step === 1 ? (
//             <CrossIcon className="w-6 h-6" />
//           ) : (
//             <ChevronLeftIcon className="w-6 h-6" />
//           )}
//         </button>

//         <h2 className="text-white font-semibold text-lg">
//           {step === 1 ? "New Highlight" : "Upload Highlight"}
//         </h2>

//         {step === 2 && (
//           <button
//             type="button"
//             onClick={() => setStep(3)}
//             className="text-blue-500 font-semibold"
//           >
//             Next
//           </button>
//         )}

//         {step === 3 && (
//           <button
//             type="button"
//             onClick={() => {
//               /* Handle upload */
//             }}
//             className="text-blue-500 font-semibold"
//             disabled={isUploading}
//           >
//             {isUploading ? "Uploading..." : "Upload"}
//           </button>
//         )}
//       </div>

//       {/* Main Content */}
//       <div className="w-full h-full flex flex-col items-center justify-center relative">
//         {step === 1 && (
//           <div className="flex flex-col items-center gap-8 p-6 text-center">
//             <div className="bg-gray-800 p-6 rounded-full">
//               <Image
//                 src="/assets/images/gallery.svg"
//                 alt="Gallery"
//                 width={60}
//                 height={60}
//                 className="filter invert"
//               />
//             </div>
//             <h3 className="text-white text-xl font-medium">
//               Upload highlights here
//             </h3>
//             <input
//               type="file"
//               accept="image/*,video/*"
//               multiple
//               hidden
//               ref={fileInputRef}
//               onChange={handleFileChange}
//             />
//             <Button
//               className="px-8 py-6 text-lg rounded-xl bg-blue-600 hover:bg-blue-700"
//               onClick={() => fileInputRef.current?.click()}
//             >
//               Select from Gallery
//             </Button>
//           </div>
//         )}

//         {step === 2 && mediaItems.length > 0 && (
//           <div
//             className="w-full h-full flex items-center justify-center relative"
//             onTouchStart={handleTouchStart}
//             onTouchMove={handleTouchMove}
//             onTouchEnd={handleTouchEnd}
//           >
//             {/* Desktop navigation buttons */}
//             <button
//               type="button"
//               onClick={handlePrevious}
//               disabled={currentIndex === 0}
//               className={`hidden md:flex absolute h-24 my-auto inset-y-0 left-0 items-center justify-start pl-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                 currentIndex === 0 ? "opacity-50" : "hover:bg-opacity-70"
//               }`}
//             >
//               <ChevronLeftIcon className="w-8 h-8" />
//             </button>

//             {/* Media display */}
//             <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative flex items-center justify-center">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="max-w-full max-h-full"
//                     onClick={togglePlayPause}
//                     onTimeUpdate={handleVideoProgress}
//                     onEnded={handleVideoEnded}
//                     muted={isMuted}
//                   />

//                   {/* Video controls overlay */}
//                   <div className="absolute inset-0 flex items-center justify-center">
//                     <button
//                       type="button"
//                       onClick={togglePlayPause}
//                       className="p-4 bg-black bg-opacity-50 rounded-full"
//                     >
//                       {isPlaying ? (
//                         <PauseIcon className="w-10 h-10 text-white" />
//                       ) : (
//                         <PlayIcon className="w-10 h-10 text-white" />
//                       )}
//                     </button>
//                   </div>

//                   {/* Video duration indicator */}
//                   <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
//                     {formatDuration(currentMedia.duration || 0)}
//                   </div>

//                   {/* Mute button */}
//                   <button
//                     type="button"
//                     onClick={toggleMute}
//                     className="absolute top-4 right-16 bg-black bg-opacity-50 p-2 rounded-full"
//                   >
//                     {isMuted ? (
//                       <VolumeXIcon className="w-5 h-5 text-white" />
//                     ) : (
//                       <Volume2Icon className="w-5 h-5 text-white" />
//                     )}
//                   </button>

//                   {/* Trim button */}
//                   {currentMedia.type === "video" && (
//                     <button
//                       type="button"
//                       onClick={toggleVideoTrimmer}
//                       className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-full"
//                     >
//                       <ScissorsIcon className="w-5 h-5 text-white" />
//                     </button>
//                   )}

//                   {/* Video progress bar */}
//                   <div className="absolute bottom-52 left-0 right-0 h-1 bg-gray-600 mx-4">
//                     <div
//                       className="h-full bg-blue-500"
//                       style={{ width: `${videoProgress}%` }}
//                     />
//                   </div>
//                 </div>
//               )}
//             </div>

//             {/* Desktop navigation buttons */}
//             <button
//               type="button"
//               onClick={handleNext}
//               disabled={currentIndex === mediaItems.length - 1}
//               className={`hidden md:flex absolute h-24 my-auto inset-y-0 right-0 items-center justify-end pr-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                 currentIndex === mediaItems.length - 1
//                   ? "opacity-50"
//                   : "hover:bg-opacity-70"
//               }`}
//             >
//               <ChevronRightIcon className="w-8 h-8" />
//             </button>
//           </div>
//         )}

//         {step === 3 && mediaItems.length > 0 && (
//           <div className="w-full h-full flex flex-col">
//             <div className="flex-1 flex items-center justify-center relative">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative w-full h-full flex items-center justify-center">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="max-w-full max-h-full"
//                     controls
//                   />
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         {/* Video trimmer overlay */}
//         {showVideoTrimmer && currentMedia?.type === "video" && (
//           <div className="absolute inset-0 bg-black bg-opacity-90 z-30 flex flex-col items-center justify-center p-4">
//             <div className="w-full max-w-2xl">
//               <video
//                 ref={videoTrimmerRef}
//                 src={currentMedia.url}
//                 className="w-full"
//                 controls
//               />

//               <div className="mt-4">
//                 <div className="flex justify-between text-white text-sm mb-2">
//                   <span>Start: {formatDuration(trimStart)}</span>
//                   <span>End: {formatDuration(trimEnd)}</span>
//                   <span>Duration: {formatDuration(trimEnd - trimStart)}</span>
//                 </div>

//                 <div className="relative h-8">
//                   <input
//                     type="range"
//                     min="0"
//                     max={currentMedia.duration}
//                     step="0.1"
//                     value={trimStart}
//                     onChange={handleTrimStartChange}
//                     className="absolute w-full h-1 bg-gray-600 appearance-none"
//                   />
//                   <input
//                     type="range"
//                     min="0"
//                     max={currentMedia.duration}
//                     step="0.1"
//                     value={trimEnd}
//                     onChange={handleTrimEndChange}
//                     className="absolute w-full h-1 bg-gray-600 appearance-none"
//                   />
//                 </div>
//               </div>

//               <div className="flex justify-end gap-4 mt-4">
//                 <button
//                   type="button"
//                   onClick={toggleVideoTrimmer}
//                   className="px-4 py-2 text-white"
//                 >
//                   Cancel
//                 </button>
//                 <button
//                   type="button"
//                   onClick={applyTrim}
//                   className="px-4 py-2 bg-blue-500 text-white rounded"
//                 >
//                   Apply
//                 </button>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Thumbnail strip */}
//         {(step === 2 || step === 3) && mediaItems.length > 0 && (
//           <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
//             <div className="flex gap-2 overflow-x-auto py-2">
//               {mediaItems.map((item, index) => (
//                 <div
//                   key={index.toString()}
//                   className={`relative w-16 h-16 rounded-md overflow-hidden ${
//                     currentIndex === index ? "ring-2 ring-black" : "opacity-70"
//                   }`}
//                 >
//                   <button
//                     type="button"
//                     onClick={() => setCurrentIndex(index)}
//                     className="w-full h-full"
//                   >
//                     {item.type === "image" ? (
//                       <Image
//                         src={item.url}
//                         alt="Thumbnail"
//                         fill
//                         className="object-cover"
//                       />
//                     ) : (
//                       <>
//                         <video
//                           src={item.url}
//                           className="w-full h-full object-cover"
//                         />
//                         <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
//                           {formatDuration(item.duration || 0)}
//                         </div>
//                       </>
//                     )}
//                   </button>

//                   {currentIndex === index && (
//                     <button
//                       type="button"
//                       onClick={() => handleDelete(index)}
//                       className="absolute top-[50%] right-[50%] bg-black bg-opacity-50 text-white rounded-md transform translate-x-1/2 -translate-y-1/2"
//                     >
//                       <Trash2Icon className="text-5xl" />
//                     </button>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // Helper function to format duration (seconds to MM:SS)
// function formatDuration(duration: number): string {
//   const minutes = Math.floor(duration / 60);
//   const seconds = Math.floor(duration % 60);
//   return `${minutes}:${seconds.toString().padStart(2, "0")}`;
// }

// 3

// import {
//   ChevronLeftIcon,
//   ChevronRightIcon,
//   CrossIcon,
//   PauseIcon,
//   PlayIcon,
//   ScissorsIcon,
//   Trash2Icon,
//   Volume2Icon,
//   VolumeXIcon,
// } from "lucide-react";
// import Image from "next/image";
// import { useEffect, useRef, useState } from "react";
// import { Button } from "../ui/button";

// type ClosePopupModalType = {
//   handleShowHighlightModal: (state: boolean) => void;
// };

// type MediaItem = {
//   url: string;
//   file: File;
//   type: "image" | "video";
//   duration?: number;
//   startTime?: number;
//   endTime?: number;
// };

// export default function HighlightModal({
//   handleShowHighlightModal,
// }: ClosePopupModalType) {
//   const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
//   const [currentIndex, setCurrentIndex] = useState(0);
//   const [isUploading, setIsUploading] = useState(false);
//   const [step, setStep] = useState(1);
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [isMuted, setIsMuted] = useState(false);
//   const [currentTime, setCurrentTime] = useState(0);
//   const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
//   const [trimStart, setTrimStart] = useState(0);
//   const [trimEnd, setTrimEnd] = useState(0);
//   const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const videoTrimmerRef = useRef<HTMLVideoElement>(null);
//   const timelineRef = useRef<HTMLDivElement>(null);
//   const touchStartX = useRef(0);
//   const touchEndX = useRef(0);

//   const currentMedia = mediaItems[currentIndex];

//   // Handle swipe gestures for mobile
//   const handleTouchStart = (e: React.TouchEvent) => {
//     touchStartX.current = e.touches[0].clientX;
//   };

//   const handleTouchMove = (e: React.TouchEvent) => {
//     touchEndX.current = e.touches[0].clientX;
//   };

//   const handleTouchEnd = () => {
//     if (touchStartX.current - touchEndX.current > 50) {
//       handleNext();
//     } else if (touchEndX.current - touchStartX.current > 50) {
//       handlePrevious();
//     }
//   };

//   // Video controls
//   const togglePlayPause = () => {
//     if (videoRef.current) {
//       if (isPlaying) {
//         videoRef.current.pause();
//       } else {
//         videoRef.current.play();
//       }
//       setIsPlaying(!isPlaying);
//     }
//   };

//   const toggleMute = () => {
//     if (videoRef.current) {
//       videoRef.current.muted = !isMuted;
//       setIsMuted(!isMuted);
//     }
//   };

//   const handleVideoTimeUpdate = () => {
//     if (videoRef.current && !isDraggingTimeline) {
//       setCurrentTime(videoRef.current.currentTime);
//     }
//   };

//   const handleVideoEnded = () => {
//     setIsPlaying(false);
//     if (currentIndex < mediaItems.length - 1) {
//       setTimeout(() => {
//         setCurrentIndex(currentIndex + 1);
//       }, 500);
//     }
//   };

//   // Handle timeline interaction
//   const handleTimelineMouseDown = (e: React.MouseEvent) => {
//     if (!videoRef.current || !timelineRef.current) return;

//     setIsDraggingTimeline(true);
//     const rect = timelineRef.current.getBoundingClientRect();
//     const position = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
//     const percentage = position / rect.width;
//     const newTime = percentage * videoRef.current.duration;

//     videoRef.current.currentTime = newTime;
//     setCurrentTime(newTime);
//     if (isPlaying) {
//       videoRef.current.pause();
//     }
//   };

//   const handleTimelineMouseMove = (e: React.MouseEvent) => {
//     if (!isDraggingTimeline || !videoRef.current || !timelineRef.current)
//       return;

//     const rect = timelineRef.current.getBoundingClientRect();
//     const position = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
//     const percentage = position / rect.width;
//     const newTime = percentage * videoRef.current.duration;

//     videoRef.current.currentTime = newTime;
//     setCurrentTime(newTime);
//   };

//   const handleTimelineMouseUp = () => {
//     setIsDraggingTimeline(false);
//     if (isPlaying && videoRef.current) {
//       videoRef.current.play();
//     }
//   };

//   // Handle file selection
//   const handleFileChange = async (
//     event: React.ChangeEvent<HTMLInputElement>,
//   ) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     const newMediaItems: MediaItem[] = [];

//     for (let i = 0; i < files.length; i++) {
//       const file = files[i];
//       const url = URL.createObjectURL(file);

//       if (file.type.startsWith("video")) {
//         const duration = await getVideoDuration(url);
//         newMediaItems.push({
//           url,
//           file,
//           type: "video",
//           duration,
//           startTime: 0,
//           endTime: duration,
//         });
//       } else {
//         newMediaItems.push({ url, file, type: "image" });
//       }
//     }

//     setMediaItems(newMediaItems);
//     setStep(2);
//   };

//   const getVideoDuration = (url: string): Promise<number> => {
//     return new Promise((resolve) => {
//       const video = document.createElement("video");
//       video.src = url;
//       video.onloadedmetadata = () => {
//         resolve(video.duration);
//       };
//     });
//   };

//   // Navigation functions
//   const handleNext = () => {
//     if (currentIndex < mediaItems.length - 1) {
//       setCurrentIndex(currentIndex + 1);
//       setIsPlaying(false);
//     }
//   };

//   const handlePrevious = () => {
//     if (currentIndex > 0) {
//       setCurrentIndex(currentIndex - 1);
//       setIsPlaying(false);
//     }
//   };

//   // Delete media item
//   const handleDelete = (index: number) => {
//     if (mediaItems.length === 1) {
//       handleShowHighlightModal(false);
//       return;
//     }

//     const newMediaItems = [...mediaItems];
//     newMediaItems.splice(index, 1);
//     setMediaItems(newMediaItems);

//     if (currentIndex >= newMediaItems.length) {
//       setCurrentIndex(newMediaItems.length - 1);
//     }
//   };

//   // Video trimming functions
//   const toggleVideoTrimmer = () => {
//     setShowVideoTrimmer(!showVideoTrimmer);
//     if (videoRef.current && !showVideoTrimmer) {
//       setTrimStart(0);
//       setTrimEnd(videoRef.current.duration);
//     }
//   };

//   const handleTrimStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const newStart = Number.parseFloat(e.target.value);
//     setTrimStart(newStart);
//     if (videoRef.current) {
//       videoRef.current.currentTime = newStart;
//     }
//   };

//   const handleTrimEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const newEnd = Number.parseFloat(e.target.value);
//     setTrimEnd(newEnd);
//   };

//   const applyTrim = () => {
//     if (videoRef.current && currentMedia.type === "video") {
//       const updatedMediaItems = [...mediaItems];
//       updatedMediaItems[currentIndex] = {
//         ...updatedMediaItems[currentIndex],
//         startTime: trimStart,
//         endTime: trimEnd,
//       };
//       setMediaItems(updatedMediaItems);
//       setShowVideoTrimmer(false);
//     }
//   };

//   // Clean up object URLs
//   useEffect(() => {
//     return () => {
//       mediaItems.forEach((item) => URL.revokeObjectURL(item.url));
//     };
//   }, [mediaItems]);

//   // Reset video state when current item changes
//   useEffect(() => {
//     setIsPlaying(false);
//     setCurrentTime(0);
//     setShowVideoTrimmer(false);
//   }, [currentIndex]);

//   // Initialize trim values when video changes
//   useEffect(() => {
//     if (currentMedia?.type === "video") {
//       setTrimStart(currentMedia.startTime || 0);
//       setTrimEnd(currentMedia.endTime || currentMedia.duration || 0);
//     }
//   }, [currentMedia]);

//   // Add event listeners for timeline dragging
//   useEffect(() => {
//     const handleMouseMove = (e: MouseEvent) => {
//       if (isDraggingTimeline && timelineRef.current) {
//         handleTimelineMouseMove(e as unknown as React.MouseEvent);
//       }
//     };

//     const handleMouseUp = () => {
//       if (isDraggingTimeline) {
//         handleTimelineMouseUp();
//       }
//     };

//     if (isDraggingTimeline) {
//       window.addEventListener("mousemove", handleMouseMove);
//       window.addEventListener("mouseup", handleMouseUp);
//     }

//     return () => {
//       window.removeEventListener("mousemove", handleMouseMove);
//       window.removeEventListener("mouseup", handleMouseUp);
//     };
//   }, [isDraggingTimeline]);

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center">
//       {/* Header */}
//       <div className="w-full flex justify-between items-center p-4 absolute top-0 z-10">
//         <button
//           type="button"
//           onClick={() =>
//             step === 1 ? handleShowHighlightModal(false) : setStep(step - 1)
//           }
//           className="text-white p-2"
//         >
//           {step === 1 ? (
//             <CrossIcon className="w-6 h-6" />
//           ) : (
//             <ChevronLeftIcon className="w-6 h-6" />
//           )}
//         </button>

//         <h2 className="text-white font-semibold text-lg">
//           {step === 1 ? "New Highlight" : "Upload Highlight"}
//         </h2>

//         {step === 2 && (
//           <button
//             type="button"
//             onClick={() => setStep(3)}
//             className="text-blue-500 font-semibold"
//           >
//             Next
//           </button>
//         )}

//         {step === 3 && (
//           <button
//             type="button"
//             onClick={() => {
//               /* Handle upload */
//             }}
//             className="text-blue-500 font-semibold"
//             disabled={isUploading}
//           >
//             {isUploading ? "Uploading..." : "Upload"}
//           </button>
//         )}
//       </div>

//       {/* Main Content */}
//       <div className="w-full h-full flex flex-col items-center justify-center relative">
//         {step === 1 && (
//           <div className="flex flex-col items-center gap-8 p-6 text-center">
//             <div className="bg-gray-800 p-6 rounded-full">
//               <Image
//                 src="/assets/images/gallery.svg"
//                 alt="Gallery"
//                 width={60}
//                 height={60}
//                 className="filter invert"
//               />
//             </div>
//             <h3 className="text-white text-xl font-medium">
//               Upload highlights here
//             </h3>
//             <input
//               type="file"
//               accept="image/*,video/*"
//               multiple
//               hidden
//               ref={fileInputRef}
//               onChange={handleFileChange}
//             />
//             <Button
//               className="px-8 py-6 text-lg rounded-xl bg-blue-600 hover:bg-blue-700"
//               onClick={() => fileInputRef.current?.click()}
//             >
//               Select from Gallery
//             </Button>
//           </div>
//         )}

//         {step === 2 && mediaItems.length > 0 && (
//           <div
//             className="w-full h-full flex items-center justify-center relative"
//             onTouchStart={handleTouchStart}
//             onTouchMove={handleTouchMove}
//             onTouchEnd={handleTouchEnd}
//           >
//             {/* Desktop navigation buttons */}
//             <button
//               type="button"
//               onClick={handlePrevious}
//               disabled={currentIndex === 0}
//               className={`hidden md:flex absolute h-24 my-auto inset-y-0 left-0 items-center justify-start pl-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                 currentIndex === 0 ? "opacity-50" : "hover:bg-opacity-70"
//               }`}
//             >
//               <ChevronLeftIcon className="w-8 h-8" />
//             </button>

//             {/* Media display */}
//             <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative flex items-center justify-center md:w-[50%] w-full h-full">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="w-full h-full"
//                     onClick={togglePlayPause}
//                     onTimeUpdate={handleVideoTimeUpdate}
//                     onEnded={handleVideoEnded}
//                     muted={isMuted}
//                   />

//                   {/* Video controls overlay */}
//                   <div className="absolute inset-0 flex items-center justify-center">
//                     <button
//                       type="button"
//                       onClick={togglePlayPause}
//                       className="p-4 bg-black bg-opacity-50 rounded-full"
//                     >
//                       {isPlaying ? (
//                         <PauseIcon className="w-10 h-10 text-white" />
//                       ) : (
//                         <PlayIcon className="w-10 h-10 text-white" />
//                       )}
//                     </button>
//                   </div>

//                   {/* Video duration indicator */}
//                   <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
//                     {formatDuration(currentTime)} /{" "}
//                     {formatDuration(currentMedia.duration || 0)}
//                   </div>

//                   {/* Mute button */}
//                   <button
//                     type="button"
//                     onClick={toggleMute}
//                     className="absolute top-4 right-16 bg-black bg-opacity-50 p-2 rounded-full"
//                   >
//                     {isMuted ? (
//                       <VolumeXIcon className="w-5 h-5 text-white" />
//                     ) : (
//                       <Volume2Icon className="w-5 h-5 text-white" />
//                     )}
//                   </button>

//                   {/* Trim button */}
//                   {currentMedia.type === "video" && (
//                     <button
//                       type="button"
//                       onClick={toggleVideoTrimmer}
//                       className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-full"
//                     >
//                       <ScissorsIcon className="w-5 h-5 text-white" />
//                     </button>
//                   )}

//                   {/* Interactive timeline */}
//                   {currentMedia.type === "video" && (
//                     <div
//                       className="absolute bottom-52 left-0 right-0 h-8 mx-4 flex items-center"
//                       onMouseDown={handleTimelineMouseDown}
//                       ref={timelineRef}
//                     >
//                       <div className="relative w-full h-2 bg-gray-600 rounded-full cursor-pointer">
//                         <div
//                           className="absolute top-0 left-0 h-full bg-blue-500 rounded-full"
//                           style={{
//                             width: `${
//                               (currentTime / (currentMedia.duration || 1)) * 100
//                             }%`,
//                           }}
//                         />
//                         <div
//                           className="absolute top-1/2 h-4 w-4 bg-blue-500 rounded-full transform -translate-y-1/2 -translate-x-1/2 cursor-pointer"
//                           style={{
//                             left: `${
//                               (currentTime / (currentMedia.duration || 1)) * 100
//                             }%`,
//                           }}
//                         />
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               )}
//             </div>

//             {/* Desktop navigation buttons */}
//             <button
//               type="button"
//               onClick={handleNext}
//               disabled={currentIndex === mediaItems.length - 1}
//               className={`hidden md:flex absolute h-24 my-auto inset-y-0 right-0 items-center justify-end pr-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                 currentIndex === mediaItems.length - 1
//                   ? "opacity-50"
//                   : "hover:bg-opacity-70"
//               }`}
//             >
//               <ChevronRightIcon className="w-8 h-8" />
//             </button>
//           </div>
//         )}

//         {step === 3 && mediaItems.length > 0 && (
//           <div className="w-full h-full flex flex-col">
//             <div className="flex-1 flex items-center justify-center relative">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative w-full h-full flex items-center justify-center">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="max-w-full max-h-full"
//                     controls
//                   />
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         {/* Video trimmer overlay */}
//         {showVideoTrimmer && currentMedia?.type === "video" && (
//           <div className="absolute inset-0 bg-black bg-opacity-90 z-30 flex flex-col items-center justify-center p-4">
//             <div className="w-full max-w-2xl">
//               <video
//                 ref={videoTrimmerRef}
//                 src={currentMedia.url}
//                 className="w-full"
//                 controls
//               />

//               <div className="mt-4">
//                 <div className="flex justify-between text-white text-sm mb-2">
//                   <span>Start: {formatDuration(trimStart)}</span>
//                   <span>End: {formatDuration(trimEnd)}</span>
//                   <span>Duration: {formatDuration(trimEnd - trimStart)}</span>
//                 </div>

//                 <div className="relative h-8">
//                   <input
//                     type="range"
//                     min="0"
//                     max={currentMedia.duration}
//                     step="0.1"
//                     value={trimStart}
//                     onChange={handleTrimStartChange}
//                     className="absolute w-full h-1 bg-gray-600 appearance-none"
//                   />
//                   <input
//                     type="range"
//                     min="0"
//                     max={currentMedia.duration}
//                     step="0.1"
//                     value={trimEnd}
//                     onChange={handleTrimEndChange}
//                     className="absolute w-full h-1 bg-gray-600 appearance-none"
//                   />
//                 </div>
//               </div>

//               <div className="flex justify-end gap-4 mt-4">
//                 <button
//                   type="button"
//                   onClick={toggleVideoTrimmer}
//                   className="px-4 py-2 text-white"
//                 >
//                   Cancel
//                 </button>
//                 <button
//                   type="button"
//                   onClick={applyTrim}
//                   className="px-4 py-2 bg-blue-500 text-white rounded"
//                 >
//                   Apply
//                 </button>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Thumbnail strip */}
//         {(step === 2 || step === 3) && mediaItems.length > 0 && (
//           <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
//             <div className="flex gap-2 overflow-x-auto py-2">
//               {mediaItems.map((item, index) => (
//                 <div
//                   key={index.toString()}
//                   className={`relative w-16 h-16 rounded-md overflow-hidden ${
//                     currentIndex === index ? "ring-2 ring-black" : "opacity-70"
//                   }`}
//                 >
//                   <button
//                     type="button"
//                     onClick={() => setCurrentIndex(index)}
//                     className="w-full h-full"
//                   >
//                     {item.type === "image" ? (
//                       <Image
//                         src={item.url}
//                         alt="Thumbnail"
//                         fill
//                         className="object-cover"
//                       />
//                     ) : (
//                       <>
//                         <video
//                           src={item.url}
//                           className="w-full h-full object-cover"
//                         />
//                         <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
//                           {formatDuration(item.duration || 0)}
//                         </div>
//                       </>
//                     )}
//                   </button>

//                   {currentIndex === index && (
//                     <button
//                       type="button"
//                       onClick={() => handleDelete(index)}
//                       className="absolute top-[50%] right-[50%] bg-black bg-opacity-50 text-white rounded-md transform translate-x-1/2 -translate-y-1/2"
//                     >
//                       <Trash2Icon className="text-5xl" />
//                     </button>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // Helper function to format duration (seconds to MM:SS)
// function formatDuration(duration: number): string {
//   const minutes = Math.floor(duration / 60);
//   const seconds = Math.floor(duration % 60);
//   return `${minutes}:${seconds.toString().padStart(2, "0")}`;
// }

// 4

// import Image from "next/image";
// import { useRef, useState, useEffect } from "react";
// import { Button } from "../ui/button";
// import {
//   CrossIcon,
//   ChevronLeftIcon,
//   ChevronRightIcon,
//   PlayIcon,
//   PauseIcon,
//   Volume2Icon,
//   VolumeXIcon,
//   Trash2Icon,
//   ScissorsIcon,
// } from "lucide-react";

// type ClosePopupModalType = {
//   handleShowHighlightModal: (state: boolean) => void;
// };

// type MediaItem = {
//   url: string;
//   file: File;
//   type: "image" | "video";
//   duration?: number;
//   startTime?: number;
//   endTime?: number;
// };

// export default function HighlightModal({
//   handleShowHighlightModal,
// }: ClosePopupModalType) {
//   const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
//   const [currentIndex, setCurrentIndex] = useState(0);
//   const [isUploading, setIsUploading] = useState(false);
//   const [step, setStep] = useState(1);
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [isMuted, setIsMuted] = useState(false);
//   const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
//   const [trimStart, setTrimStart] = useState(0);
//   const [trimEnd, setTrimEnd] = useState(0);
//   const [isDragging, setIsDragging] = useState(false);
//   const [dragHandle, setDragHandle] = useState<"start" | "end" | null>(null);
//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const videoTrimmerRef = useRef<HTMLVideoElement>(null);
//   const trackEditorRef = useRef<HTMLDivElement>(null);
//   const touchStartX = useRef(0);
//   const touchEndX = useRef(0);

//   const currentMedia = mediaItems[currentIndex];
//   const maxDuration = 60; // 1 minute in seconds

//   // Handle swipe gestures for mobile
//   const handleTouchStart = (e: React.TouchEvent) => {
//     touchStartX.current = e.touches[0].clientX;
//   };

//   const handleTouchMove = (e: React.TouchEvent) => {
//     touchEndX.current = e.touches[0].clientX;
//   };

//   const handleTouchEnd = () => {
//     if (touchStartX.current - touchEndX.current > 50) {
//       handleNext();
//     } else if (touchEndX.current - touchStartX.current > 50) {
//       handlePrevious();
//     }
//   };

//   // Video controls
//   const togglePlayPause = () => {
//     if (videoRef.current) {
//       if (isPlaying) {
//         videoRef.current.pause();
//       } else {
//         videoRef.current.play();
//       }
//       setIsPlaying(!isPlaying);
//     }
//   };

//   const toggleMute = () => {
//     if (videoRef.current) {
//       videoRef.current.muted = !isMuted;
//       setIsMuted(!isMuted);
//     }
//   };

//   const handleVideoEnded = () => {
//     setIsPlaying(false);
//     if (currentIndex < mediaItems.length - 1) {
//       setTimeout(() => {
//         setCurrentIndex(currentIndex + 1);
//       }, 500);
//     }
//   };

//   // Handle file selection
//   const handleFileChange = async (
//     event: React.ChangeEvent<HTMLInputElement>
//   ) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;

//     const newMediaItems: MediaItem[] = [];

//     for (let i = 0; i < files.length; i++) {
//       const file = files[i];
//       const url = URL.createObjectURL(file);

//       if (file.type.startsWith("video")) {
//         const duration = await getVideoDuration(url);
//         // Ensure video doesn't exceed max duration
//         const endTime = Math.min(duration, maxDuration);
//         newMediaItems.push({
//           url,
//           file,
//           type: "video",
//           duration,
//           startTime: 0,
//           endTime,
//         });
//       } else {
//         newMediaItems.push({ url, file, type: "image" });
//       }
//     }

//     setMediaItems(newMediaItems);
//     setStep(2);
//   };

//   const getVideoDuration = (url: string): Promise<number> => {
//     return new Promise((resolve) => {
//       const video = document.createElement("video");
//       video.src = url;
//       video.onloadedmetadata = () => {
//         resolve(video.duration);
//       };
//     });
//   };

//   // Navigation functions
//   const handleNext = () => {
//     if (currentIndex < mediaItems.length - 1) {
//       setCurrentIndex(currentIndex + 1);
//       setIsPlaying(false);
//     }
//   };

//   const handlePrevious = () => {
//     if (currentIndex > 0) {
//       setCurrentIndex(currentIndex - 1);
//       setIsPlaying(false);
//     }
//   };

//   // Delete media item
//   const handleDelete = (index: number) => {
//     if (mediaItems.length === 1) {
//       handleShowHighlightModal(false);
//       return;
//     }

//     const newMediaItems = [...mediaItems];
//     newMediaItems.splice(index, 1);
//     setMediaItems(newMediaItems);

//     if (currentIndex >= newMediaItems.length) {
//       setCurrentIndex(newMediaItems.length - 1);
//     }
//   };

//   // Video trimming functions
//   const toggleVideoTrimmer = () => {
//     setShowVideoTrimmer(!showVideoTrimmer);
//     if (videoRef.current && !showVideoTrimmer) {
//       setTrimStart(0);
//       setTrimEnd(Math.min(videoRef.current.duration, maxDuration));
//     }
//   };

//   const handleTrackEditorClick = (e: React.MouseEvent) => {
//     if (!trackEditorRef.current || !videoRef.current || !currentMedia) return;

//     const rect = trackEditorRef.current.getBoundingClientRect();
//     const clickPosition = e.clientX - rect.left;
//     const percentage = clickPosition / rect.width;
//     const seekTime = percentage * currentMedia.duration!;

//     videoRef.current.currentTime = Math.min(seekTime, maxDuration);
//     if (!isPlaying) {
//       videoRef.current.pause();
//     }
//   };

//   const handleDragStart = (handleType: "start" | "end") => {
//     setIsDragging(true);
//     setDragHandle(handleType);
//   };

//   const handleDragMove = (e: MouseEvent) => {
//     if (!isDragging || !trackEditorRef.current || !currentMedia) return;

//     const rect = trackEditorRef.current.getBoundingClientRect();
//     const position = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
//     const percentage = position / rect.width;
//     const newTime = percentage * currentMedia.duration!;

//     if (dragHandle === "start") {
//       const newStart = Math.min(newTime, trimEnd - 0.1);
//       setTrimStart(newStart);
//       if (videoRef.current) {
//         videoRef.current.currentTime = newStart;
//       }
//     } else {
//       const newEnd = Math.max(newTime, trimStart + 0.1);
//       setTrimEnd(Math.min(newEnd, maxDuration));
//     }
//   };

//   const handleDragEnd = () => {
//     setIsDragging(false);
//     setDragHandle(null);
//   };

//   const applyTrim = () => {
//     if (videoRef.current && currentMedia.type === "video") {
//       const updatedMediaItems = [...mediaItems];
//       updatedMediaItems[currentIndex] = {
//         ...updatedMediaItems[currentIndex],
//         startTime: trimStart,
//         endTime: trimEnd,
//       };
//       setMediaItems(updatedMediaItems);
//       setShowVideoTrimmer(false);
//     }
//   };

//   // Clean up object URLs
//   useEffect(() => {
//     return () => {
//       mediaItems.forEach((item) => URL.revokeObjectURL(item.url));
//     };
//   }, [mediaItems]);

//   // Reset video state when current item changes
//   useEffect(() => {
//     setIsPlaying(false);
//     setShowVideoTrimmer(false);
//   }, [currentIndex]);

//   // Initialize trim values when video changes
//   useEffect(() => {
//     if (currentMedia?.type === "video") {
//       setTrimStart(currentMedia.startTime || 0);
//       setTrimEnd(
//         Math.min(
//           currentMedia.endTime || currentMedia.duration || 0,
//           maxDuration
//         )
//       );
//     }
//   }, [currentMedia]);

//   // Add event listeners for dragging
//   useEffect(() => {
//     if (isDragging) {
//       window.addEventListener("mousemove", handleDragMove);
//       window.addEventListener("mouseup", handleDragEnd);
//       return () => {
//         window.removeEventListener("mousemove", handleDragMove);
//         window.removeEventListener("mouseup", handleDragEnd);
//       };
//     }
//   }, [isDragging, dragHandle]);

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center">
//       {/* Header */}
//       <div className="w-full flex justify-between items-center p-4 absolute top-0 z-10">
//         <button
//           type="button"
//           onClick={() =>
//             step === 1 ? handleShowHighlightModal(false) : setStep(step - 1)
//           }
//           className="text-white p-2"
//         >
//           {step === 1 ? (
//             <CrossIcon className="w-6 h-6" />
//           ) : (
//             <ChevronLeftIcon className="w-6 h-6" />
//           )}
//         </button>

//         <h2 className="text-white font-semibold text-lg">
//           {step === 1 ? "New Highlight" : "Upload Highlight"}
//         </h2>

//         {step === 2 && (
//           <button
//             type="button"
//             onClick={() => setStep(3)}
//             className="text-blue-500 font-semibold"
//           >
//             Next
//           </button>
//         )}

//         {step === 3 && (
//           <button
//             type="button"
//             onClick={() => {
//               /* Handle upload */
//             }}
//             className="text-blue-500 font-semibold"
//             disabled={isUploading}
//           >
//             {isUploading ? "Uploading..." : "Upload"}
//           </button>
//         )}
//       </div>

//       {/* Main Content */}
//       <div className="w-full h-full flex flex-col items-center justify-center relative">
//         {step === 1 && (
//           <div className="flex flex-col items-center gap-8 p-6 text-center">
//             <div className="bg-gray-800 p-6 rounded-full">
//               <Image
//                 src="/assets/images/gallery.svg"
//                 alt="Gallery"
//                 width={60}
//                 height={60}
//                 className="filter invert"
//               />
//             </div>
//             <h3 className="text-white text-xl font-medium">
//               Upload highlights here
//             </h3>
//             <input
//               type="file"
//               accept="image/*,video/*"
//               multiple
//               hidden
//               ref={fileInputRef}
//               onChange={handleFileChange}
//             />
//             <Button
//               className="px-8 py-6 text-lg rounded-xl bg-blue-600 hover:bg-blue-700"
//               onClick={() => fileInputRef.current?.click()}
//             >
//               Select from Gallery
//             </Button>
//           </div>
//         )}

//         {step === 2 && mediaItems.length > 0 && (
//           <div
//             className="w-full h-full flex items-center justify-center relative"
//             onTouchStart={handleTouchStart}
//             onTouchMove={handleTouchMove}
//             onTouchEnd={handleTouchEnd}
//           >
//             {/* Desktop navigation buttons */}
//             <button
//               type="button"
//               onClick={handlePrevious}
//               disabled={currentIndex === 0}
//               className={`hidden md:flex absolute h-24 my-auto inset-y-0 left-0 items-center justify-start pl-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                 currentIndex === 0 ? "opacity-50" : "hover:bg-opacity-70"
//               }`}
//             >
//               <ChevronLeftIcon className="w-8 h-8" />
//             </button>

//             {/* Media display */}
//             <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative flex items-center justify-center w-full h-full">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="max-w-full max-h-full"
//                     onClick={togglePlayPause}
//                     onEnded={handleVideoEnded}
//                     muted={isMuted}
//                   />

//                   {/* Video controls overlay */}
//                   <div className="absolute inset-0 flex items-center justify-center">
//                     <button
//                       type="button"
//                       onClick={togglePlayPause}
//                       className="p-4 bg-black bg-opacity-50 rounded-full"
//                     >
//                       {isPlaying ? (
//                         <PauseIcon className="w-10 h-10 text-white" />
//                       ) : (
//                         <PlayIcon className="w-10 h-10 text-white" />
//                       )}
//                     </button>
//                   </div>

//                   {/* Video duration indicator */}
//                   <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
//                     {formatDuration(currentMedia.duration || 0)}
//                   </div>

//                   {/* Mute button */}
//                   <button
//                     type="button"
//                     onClick={toggleMute}
//                     className="absolute top-4 right-16 bg-black bg-opacity-50 p-2 rounded-full"
//                   >
//                     {isMuted ? (
//                       <VolumeXIcon className="w-5 h-5 text-white" />
//                     ) : (
//                       <Volume2Icon className="w-5 h-5 text-white" />
//                     )}
//                   </button>

//                   {/* Trim button */}
//                   {currentMedia.type === "video" && (
//                     <button
//                       type="button"
//                       onClick={toggleVideoTrimmer}
//                       className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-full"
//                     >
//                       <ScissorsIcon className="w-5 h-5 text-white" />
//                     </button>
//                   )}
//                 </div>
//               )}
//             </div>

//             {/* Desktop navigation buttons */}
//             <button
//               type="button"
//               onClick={handleNext}
//               disabled={currentIndex === mediaItems.length - 1}
//               className={`hidden md:flex absolute h-24 my-auto inset-y-0 right-0 items-center justify-end pr-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
//                 currentIndex === mediaItems.length - 1
//                   ? "opacity-50"
//                   : "hover:bg-opacity-70"
//               }`}
//             >
//               <ChevronRightIcon className="w-8 h-8" />
//             </button>
//           </div>
//         )}

//         {step === 3 && mediaItems.length > 0 && (
//           <div className="w-full h-full flex flex-col">
//             <div className="flex-1 flex items-center justify-center relative">
//               {currentMedia.type === "image" ? (
//                 <Image
//                   src={currentMedia.url}
//                   alt="Selected media"
//                   fill
//                   className="object-contain"
//                 />
//               ) : (
//                 <div className="relative w-full h-full flex items-center justify-center">
//                   <video
//                     ref={videoRef}
//                     src={currentMedia.url}
//                     className="max-w-full max-h-full"
//                     controls
//                   />
//                 </div>
//               )}
//             </div>
//           </div>
//         )}

//         {/* Video trimmer overlay */}
//         {showVideoTrimmer && currentMedia?.type === "video" && (
//           <div className="absolute inset-0 bg-black bg-opacity-90 z-30 flex flex-col items-center justify-center p-4">
//             <div className="w-full max-w-2xl">
//               <video
//                 ref={videoTrimmerRef}
//                 src={currentMedia.url}
//                 className="w-full"
//                 controls
//               />

//               <div className="mt-4">
//                 <div className="flex justify-between text-white text-sm mb-2">
//                   <span>Start: {formatDuration(trimStart)}</span>
//                   <span>End: {formatDuration(trimEnd)}</span>
//                   <span>Duration: {formatDuration(trimEnd - trimStart)}</span>
//                 </div>

//                 {/* WhatsApp-like track editor */}
//                 <div
//                   ref={trackEditorRef}
//                   className="relative h-16 bg-gray-700 rounded-md cursor-pointer"
//                   onClick={handleTrackEditorClick}
//                 >
//                   {/* Preview thumbnails would go here in a real implementation */}
//                   <div className="absolute inset-0 bg-gray-600 opacity-50"></div>

//                   {/* Trim handles */}
//                   <div
//                     className="absolute top-0 bottom-0 left-0 w-2 bg-blue-500 cursor-ew-resize"
//                     style={{
//                       left: `${(trimStart / currentMedia.duration!) * 100}%`,
//                     }}
//                     onMouseDown={() => handleDragStart("start")}
//                   />
//                   <div
//                     className="absolute top-0 bottom-0 right-0 w-2 bg-blue-500 cursor-ew-resize"
//                     style={{
//                       right: `${
//                         100 - (trimEnd / currentMedia.duration!) * 100
//                       }%`,
//                     }}
//                     onMouseDown={() => handleDragStart("end")}
//                   />

//                   {/* Selected range */}
//                   <div
//                     className="absolute top-0 bottom-0 bg-blue-500 opacity-30"
//                     style={{
//                       left: `${(trimStart / currentMedia.duration!) * 100}%`,
//                       right: `${
//                         100 - (trimEnd / currentMedia.duration!) * 100
//                       }%`,
//                     }}
//                   />
//                 </div>
//               </div>

//               <div className="flex justify-end gap-4 mt-4">
//                 <button
//                   type="button"
//                   onClick={toggleVideoTrimmer}
//                   className="px-4 py-2 text-white"
//                 >
//                   Cancel
//                 </button>
//                 <button
//                   type="button"
//                   onClick={applyTrim}
//                   className="px-4 py-2 bg-blue-500 text-white rounded"
//                 >
//                   Apply
//                 </button>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Thumbnail strip */}
//         {(step === 2 || step === 3) && mediaItems.length > 0 && (
//           <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
//             <div className="flex gap-2 overflow-x-auto py-2">
//               {mediaItems.map((item, index) => (
//                 <div
//                   key={index.toString()}
//                   className={`relative w-16 h-16 rounded-md overflow-hidden ${
//                     currentIndex === index ? "ring-2 ring-black" : "opacity-70"
//                   }`}
//                 >
//                   <button
//                     type="button"
//                     onClick={() => setCurrentIndex(index)}
//                     className="w-full h-full"
//                   >
//                     {item.type === "image" ? (
//                       <Image
//                         src={item.url}
//                         alt="Thumbnail"
//                         fill
//                         className="object-cover"
//                       />
//                     ) : (
//                       <>
//                         <video
//                           src={item.url}
//                           className="w-full h-full object-cover"
//                         />
//                         <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
//                           {formatDuration(item.duration || 0)}
//                         </div>
//                       </>
//                     )}
//                   </button>

//                   {currentIndex === index && (
//                     <button
//                       type="button"
//                       onClick={() => handleDelete(index)}
//                       className="absolute top-[50%] right-[50%] bg-black bg-opacity-50 text-white rounded-md transform translate-x-1/2 -translate-y-1/2"
//                     >
//                       <Trash2Icon className="text-5xl" />
//                     </button>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // Helper function to format duration (seconds to MM:SS)
// function formatDuration(duration: number): string {
//   const minutes = Math.floor(duration / 60);
//   const seconds = Math.floor(duration % 60);
//   return `${minutes}:${seconds.toString().padStart(2, "0")}`;
// }
