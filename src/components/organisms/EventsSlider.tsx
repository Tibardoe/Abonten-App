"use client";

import type { UserPostType } from "@/types/postsType";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";
import { MdKeyboardArrowRight } from "react-icons/md";
import EventCard from "../molecules/EventCard";

type EventsSliderProp = {
  heading: string;
  eventCategory?: string;
  urlPath?: string;
  events: UserPostType[];
};

export default function EventsSlider({
  heading,
  events,
  eventCategory,
  urlPath,
}: EventsSliderProp) {
  const [showLeftArrow, setShowLeftArrow] = useState(false);

  const [showRightArrow, setShowRightArrow] = useState(false);

  const scrollRef = useRef<HTMLUListElement>(null);

  const { location } = useParams();

  const checkScrollPosition = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
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

  const scroll = (direction: "left" | "right") => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.75;

    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const viewAllLink = urlPath
    ? `/events/${urlPath}`
    : eventCategory
      ? `/events/${location}/explore/similar-events?category=${generateSlug(
          eventCategory,
        )}`
      : "#";

  return (
    <div className="space-y-2">
      <div className="flex justify-between font-bold">
        <h2 className="text-primary md:text-lg">{heading}</h2>

        {events.length > 0 && (
          <Link
            href={viewAllLink}
            className="flex items-center gap-1 group transition-all"
          >
            <span className="text-primary md:text-lg font-bold hover:underline">
              View all
            </span>
            <MdKeyboardArrowRight className="text-2xl transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Overlay */}
        {events.length === 0 && (
          <div className="text-gray-200 font-semibold md:text-xl rounded-xl w-full h-56 bg-black bg-opacity-60 flex justify-center items-center">
            Events unavailable in this category
          </div>
        )}

        {/* slide left button */}
        {/* {events.length !== 0 && (
          <button
            type="button"
            onClick={() => scroll("left")}
            className="bg-white shadow-xl hidden md:grid place-items-center rounded-full w-10 h-10 absolute top-[50%] -translate-y-[50%]"
          >
            <FaArrowLeftLong className="text-2xl" />
          </button>
        )} */}

        {showLeftArrow && (
          <button
            type="button"
            onClick={() => scroll("left")}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
            aria-label="Scroll left"
          >
            <FaArrowLeftLong className="text-xl text-gray-700" />
          </button>
        )}

        {/* slider container and element */}
        <ul
          ref={scrollRef}
          className="grid grid-flow-col auto-cols-[75%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[23%] gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-2 py-3"
          // className="grid grid-flow-col auto-cols-[300px] overflow-x-scroll scrollbar-hide gap-2 pb-4 relative"
        >
          {events.map((event) => (
            <EventCard
              key={event.title}
              title={event.title}
              id={event.id}
              flyer_public_id={event.flyer_public_id}
              flyer_version={event.flyer_version}
              address={event.address}
              event_code={event.event_code}
              starts_at={event.starts_at}
              ends_at={event.ends_at}
              event_dates={event.event_dates}
              min_price={event.min_price}
              organizer_id={event.organizer_id}
              currency={event.currency}
              created_at={event.created_at}
              capacity={event.capacity}
              attendanceCount={event.attendanceCount}
              status={event.status}
            />
          ))}
        </ul>

        {/* slide right button */}
        {/* {events.length !== 0 && (
          <button
            type="button"
            onClick={() => scroll("right")}
            className="bg-white shadow-xl hidden md:grid place-items-center rounded-full w-10 h-10 absolute top-[50%] -translate-y-[50%] right-0"
          >
            <FaArrowRightLong className="text-2xl" />
          </button>
        )} */}
        {showRightArrow && (
          <button
            type="button"
            onClick={() => scroll("right")}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
            aria-label="Scroll right"
          >
            <FaArrowRightLong className="text-xl text-gray-700" />
          </button>
        )}
      </div>
    </div>
  );
}

// "use client";

// import type { UserPostType } from "@/types/postsType";
// import { generateSlug } from "@/utils/geerateSlug";
// import Image from "next/image";
// import Link from "next/link";
// import { useParams } from "next/navigation";
// import { useRef, useState, useEffect } from "react";
// import EventCard from "../molecules/EventCard";
// import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";

// type EventsSliderProp = {
//   heading: string;
//   eventCategory?: string;
//   urlPath?: string;
//   events: UserPostType[];
// };

// export default function EventsSlider({
//   heading,
//   events,
//   eventCategory,
//   urlPath,
// }: EventsSliderProp) {
//   const scrollRef = useRef<HTMLUListElement>(null);
//   const [showLeftArrow, setShowLeftArrow] = useState(false);
//   const [showRightArrow, setShowRightArrow] = useState(false);
//   const { location } = useParams();

//   const checkScrollPosition = () => {
//     if (scrollRef.current) {
//       const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
//       setShowLeftArrow(scrollLeft > 0);
//       setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
//     }
//   };

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
//   }, [events]);

//   const scroll = (direction: "left" | "right") => {
//     const container = scrollRef.current;
//     if (!container) return;

//     const scrollAmount = container.clientWidth * 0.75;

//     container.scrollBy({
//       left: direction === "left" ? -scrollAmount : scrollAmount,
//       behavior: "smooth",
//     });
//   };

//   return (
//     <section className="my-10 space-y-5">
//       {/* Header */}
//       <div className="flex justify-between items-center px-1">
//         <h2 className="text-2xl font-bold text-gray-900">{heading}</h2>

//         {events.length > 0 && (
//           <Link
//             href={
//               urlPath
//                 ? `/events/${urlPath}`
//                 : `/events/${location}/explore/similar-events?category=${
//                     eventCategory && generateSlug(eventCategory)
//                   }`
//             }
//             className="flex items-center gap-2 group transition-all"
//           >
//             <span className="text-primary font-medium hover:underline">
//               View all
//             </span>
//             <Image
//               src="/assets/images/arrowRight.svg"
//               alt="Arrow right"
//               width={20}
//               height={20}
//               className="transition-transform group-hover:translate-x-1"
//             />
//           </Link>
//         )}
//       </div>

//       {/* Slider Container */}
//       <div className="relative">
//         {/* Empty State */}
//         {events.length === 0 && (
//           <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-gray-50 border border-gray-200">
//             <Image
//               src="/assets/images/empty-events.svg"
//               alt="No events"
//               width={120}
//               height={120}
//               className="opacity-70 mb-4"
//             />
//             <p className="text-gray-500 font-medium">
//               No events available in this category
//             </p>
//           </div>
//         )}

//         {/* Navigation Arrows */}
//         {showLeftArrow && (
//           <button
//             type="button"
//             onClick={() => scroll("left")}
//             className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
//             aria-label="Scroll left"
//           >
//             <FaArrowLeftLong className="text-xl text-gray-700" />
//           </button>
//         )}

//         {/* Events Slider */}
//         <ul
//           ref={scrollRef}
//           className="grid grid-flow-col auto-cols-[75%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[23%] gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-2 py-3"
//         >
//           {events.map((event) => (
//             <li key={`${event.id}-${event.event_code}`} className="snap-start">
//               <EventCard {...event} />
//             </li>
//           ))}
//         </ul>

//         {showRightArrow && (
//           <button
//             type="button"
//             onClick={() => scroll("right")}
//             className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
//             aria-label="Scroll right"
//           >
//             <FaArrowRightLong className="text-xl text-gray-700" />
//           </button>
//         )}
//       </div>
//     </section>
//   );
// }

// "use client";

// import type { UserPostType } from "@/types/postsType";
// import { generateSlug } from "@/utils/geerateSlug";
// import Image from "next/image";
// import Link from "next/link";
// import { useParams } from "next/navigation";
// import { useRef, useState, useEffect } from "react";
// import EventCard from "../molecules/EventCard";
// import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";

// type EventsSliderProp = {
//   heading: string;
//   eventCategory?: string;
//   urlPath?: string;
//   events: UserPostType[];
// };

// export default function EventsSlider({
//   heading,
//   events,
//   eventCategory,
//   urlPath,
// }: EventsSliderProp) {
//   const scrollRef = useRef<HTMLUListElement>(null);
//   const [showLeftArrow, setShowLeftArrow] = useState(false);
//   const [showRightArrow, setShowRightArrow] = useState(false);
//   const params = useParams();
//   const location =
//     typeof params?.location === "string" ? params.location : "default-location";

//   const checkScrollPosition = () => {
//     if (scrollRef.current) {
//       const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
//       setShowLeftArrow(scrollLeft > 0);
//       setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
//     }
//   };

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
//   }, [events]);

//   const scroll = (direction: "left" | "right") => {
//     const container = scrollRef.current;
//     if (!container) return;

//     const scrollAmount = container.clientWidth * 0.75;

//     container.scrollBy({
//       left: direction === "left" ? -scrollAmount : scrollAmount,
//       behavior: "smooth",
//     });
//   };

//   const viewAllLink = urlPath
//     ? `/events/${urlPath}`
//     : eventCategory
//     ? `/events/${location}/explore/similar-events?category=${generateSlug(
//         eventCategory
//       )}`
//     : "#";

//   return (
//     <section className="my-10 space-y-5">
//       {/* Header */}
//       <div className="flex justify-between items-center px-1">
//         <h2 className="text-2xl font-bold text-gray-900">{heading}</h2>

//         {events.length > 0 && (
//           <Link
//             href={viewAllLink}
//             className="flex items-center gap-2 group transition-all"
//           >
//             <span className="text-primary font-medium hover:underline">
//               View all
//             </span>
//             <Image
//               src="/assets/images/arrowRight.svg"
//               alt="Arrow right"
//               width={20}
//               height={20}
//               className="transition-transform group-hover:translate-x-1"
//             />
//           </Link>
//         )}
//       </div>

//       {/* Slider Container */}
//       <div className="relative">
//         {/* Empty State */}
//         {events.length === 0 && (
//           <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-gray-50 border border-gray-200">
//             <Image
//               src="/assets/images/empty-events.svg"
//               alt="No events"
//               width={120}
//               height={120}
//               className="opacity-70 mb-4"
//             />
//             <p className="text-gray-500 font-medium">
//               No events available in this category
//             </p>
//           </div>
//         )}

//         {/* Navigation Arrows */}
//         {showLeftArrow && (
//           <button
//             type="button"
//             onClick={() => scroll("left")}
//             className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
//             aria-label="Scroll left"
//           >
//             <FaArrowLeftLong className="text-xl text-gray-700" />
//           </button>
//         )}

//         {/* Events Slider */}
//         <ul
//           ref={scrollRef}
//           className="grid grid-flow-col auto-cols-[75%] sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[23%] gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-2 py-3"
//         >
//           {events.map((event) => (
//             <li key={`${event.id}-${event.event_code}`} className="snap-start">
//               <EventCard {...event} />
//             </li>
//           ))}
//         </ul>

//         {showRightArrow && (
//           <button
//             type="button"
//             onClick={() => scroll("right")}
//             className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110"
//             aria-label="Scroll right"
//           >
//             <FaArrowRightLong className="text-xl text-gray-700" />
//           </button>
//         )}
//       </div>
//     </section>
//   );
// }
