// "use client";

// import type { UserPostType } from "@/types/postsType";
// import { getFormattedEventDate } from "@/utils/dateFormatter";
// import { generateSlug } from "@/utils/geerateSlug";
// import { getEventStatusOverlay } from "@/utils/getEventStatusOverlay";
// import Image from "next/image";
// import Link from "next/link";
// import { useParams } from "next/navigation";
// import { IoLocationOutline, IoTimeOutline } from "react-icons/io5";
// import { MdOutlineDateRange } from "react-icons/md";
// // import EventCardFlyerImage from "../atoms/EventCardFlyerImage";
// import EventCardMenuBtn from "../atoms/EventCardMenuBtn";

// export default function EventCard({
//   title,
//   flyer_public_id,
//   flyer_version,
//   address,
//   starts_at,
//   ends_at,
//   event_dates,
//   min_price,
//   attendanceCount,
//   currency,
//   capacity,
//   id,
//   event_code,
//   status,
//   organizer_id,
// }: UserPostType) {
//   const dateTime = getFormattedEventDate(starts_at, ends_at, event_dates);

//   const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

//   const { location } = useParams();

//   const overlayMessage = getEventStatusOverlay(starts_at, ends_at, event_dates);

//   return (
//     <li
//       key={title}
//       className="relative overflow-hidden rounded-xl shadow-md border border-gray-200 transition-transform hover:scale-[1.015] bg-white"
//     >
//       {status === "canceled" && (
//         <div className="absolute left-0 top-0 w-full h-full bg-black bg-opacity-60 text-gray-300 z-10 md:text-xl text-2xl flex justify-center items-center font-bold">
//           Event canceled
//         </div>
//       )}

//       {overlayMessage && status !== "canceled" && (
//         <div className="absolute left-0 top-0 w-full h-full bg-black bg-opacity-50 text-gray-300 z-10 md:text-xl text-2xl flex justify-center items-center font-bold">
//           {overlayMessage}
//         </div>
//       )}

//       <Link
//         href={`/events/${
//           location ? location : generateSlug(address.full_address)
//         }/${event_code.toLowerCase()}`}
//         className="block relative h-56 w-full overflow-hidden rounded-t-2xl"
//       >
//         <Image
//           src={`${cloudinaryBaseUrl}v${flyer_version}/${flyer_public_id}.jpg`}
//           alt={`Flyer for ${title}`}
//           fill
//           className="transition-transform duration-300 hover:scale-105 object-cover"
//           priority
//         />
//       </Link>

//       <div className="flex flex-col gap-2 p-4">
//         <div className="flex justify-between items-start">
//           <Link
//             href={`/events/${
//               location ? location : generateSlug(address.full_address)
//             }/${event_code.toLowerCase()}`}
//             className="text-xl font-semibold text-gray-800"
//           >
//             {title}
//           </Link>

//           <EventCardMenuBtn
//             eventId={id}
//             eventTitle={title}
//             address={address.full_address}
//             organizerId={organizer_id}
//           />
//         </div>

//         <div className="flex justify-between text-sm text-gray-600">
//           <span>
//             Capacity: {capacity && capacity > 0 ? capacity : "Unlimited"}
//           </span>
//           <span>Attending: {attendanceCount}</span>
//         </div>

//         <div className="flex items-center gap-2 text-gray-700 text-sm">
//           <IoLocationOutline className="text-lg" />
//           <p>{address?.full_address || "No address"}</p>
//         </div>

//         <div className="flex items-center gap-2 text-gray-700 text-sm">
//           <MdOutlineDateRange className="text-lg" />
//           <p>{dateTime?.date || "Date not available"}</p>
//         </div>

//         <div className="flex justify-between items-center text-sm text-gray-700">
//           <div className="flex items-center gap-2">
//             <IoTimeOutline className="text-lg" />
//             <p>{dateTime?.time || "Time not available"}</p>
//           </div>

//           <span
//             className={`px-2 py-0.5 rounded-full text-xs font-medium ${
//               min_price === 0 || min_price === null
//                 ? "bg-green-100 text-green-700"
//                 : "bg-blue-100 text-blue-700"
//             }`}
//           >
//             {min_price === 0 || min_price === null
//               ? "Free"
//               : `${currency} ${min_price}`}
//           </span>
//         </div>
//       </div>
//     </li>
//   );
// }

"use client";

import type { UserPostType } from "@/types/postsType";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import { generateSlug } from "@/utils/geerateSlug";
import { getEventStatusOverlay } from "@/utils/getEventStatusOverlay";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IoLocationOutline, IoTimeOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
import EventCardMenuBtn from "../atoms/EventCardMenuBtn";

export default function EventCard({
  title,
  flyer_public_id,
  flyer_version,
  address,
  starts_at,
  ends_at,
  event_dates,
  min_price,
  attendanceCount,
  currency,
  capacity,
  id,
  event_code,
  status,
  organizer_id,
}: UserPostType) {
  const dateTime = getFormattedEventDate(starts_at, ends_at, event_dates);
  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";
  const { location } = useParams();
  const overlayMessage = getEventStatusOverlay(starts_at, ends_at, event_dates);

  return (
    <li className="relative group overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 bg-white border border-gray-100 hover:border-gray-200">
      {/* Status Overlays */}
      {(status === "canceled" || overlayMessage) && (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center 
          ${status === "canceled" ? "bg-red-900/80" : "bg-black/70"} 
          backdrop-blur-sm text-white font-bold text-lg md:text-xl p-4 text-center`}
        >
          {status === "canceled" ? "Event Canceled" : overlayMessage}
        </div>
      )}

      {/* Flyer Image */}
      <Link
        href={`/events/${
          location ? location : generateSlug(address.full_address)
        }/${event_code.toLowerCase()}`}
        className="block relative h-64 w-full overflow-hidden"
      >
        <Image
          src={`${cloudinaryBaseUrl}v${flyer_version}/${flyer_public_id}.jpg`}
          alt={`Flyer for ${title}`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>

      {/* Card Content */}
      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start gap-3">
          <Link
            href={`/events/${
              location ? location : generateSlug(address.full_address)
            }/${event_code.toLowerCase()}`}
            className="text-xl font-bold text-gray-900 hover:text-primary transition-colors line-clamp-2"
            title={title}
          >
            {title}
          </Link>

          <EventCardMenuBtn
            eventId={id}
            eventTitle={title}
            address={address.full_address}
            organizerId={organizer_id}
          />
        </div>

        {/* Event Metadata */}
        <div className="space-y-2.5">
          {/* Location */}
          <div className="flex items-start gap-2 text-gray-600">
            <IoLocationOutline className="mt-0.5 flex-shrink-0 text-lg text-gray-400" />
            <p className="text-sm line-clamp-2">
              {address?.full_address || "Location not specified"}
            </p>
          </div>

          {/* Date & Time */}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-gray-600">
              <MdOutlineDateRange className="text-lg text-gray-400" />
              <span className="text-sm">
                {dateTime?.date || "Date not available"}
              </span>
            </div>

            <div className="flex items-center gap-2 text-gray-600">
              <IoTimeOutline className="text-lg text-gray-400" />
              <span className="text-sm">
                {dateTime?.time || "Time not available"}
              </span>
            </div>
          </div>

          {/* Capacity & Attendance */}
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="px-2 py-1 bg-gray-100 rounded-full">
                {capacity && capacity > 0 ? `${capacity} spots` : "Unlimited"}
              </span>
              <span className="px-2 py-1 bg-gray-100 rounded-full">
                {attendanceCount} attending
              </span>
            </div>

            {/* Price Badge */}
            <span
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                min_price === 0 || min_price === null
                  ? "bg-green-100 text-green-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {min_price === 0 || min_price === null
                ? "Free Entry"
                : `${currency} ${min_price?.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
