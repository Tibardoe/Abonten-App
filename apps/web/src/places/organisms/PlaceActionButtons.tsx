"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import GetDirectionBtn from "@/components/atoms/GetDirectionBtn";
import RequestBookingButton from "@/places/molecules/RequestBookingButton";
import { FiPhone } from "react-icons/fi";
import { IoLogoWhatsapp } from "react-icons/io5";

type BookingService = {
  id: string;
  name: string;
};

type PlaceActionButtonsProps = {
  placeId: string;
  placeName: string;
  ownerId: string;
  location: string;
  phone: string | null;
  whatsapp: string | null;
  services: BookingService[];
};

// Primary, essential actions, per the Places spec -- Directions, Book
// (Places Phase 2, Milestone 4 -- "Book, if enabled" was always meant to go
// here per the original Phase 1 spec, just not built until now), Call,
// WhatsApp. Each click logs analytics fire-and-forget (never awaited, never
// blocks navigation/the tel:/wa.me link) via logPlaceEngagement --
// RequestBookingButton gates its own visibility (signed-in, non-owner) and
// opens a modal rather than navigating, so it has no engagement click to log
// here.
export default function PlaceActionButtons({
  placeId,
  placeName,
  ownerId,
  location,
  phone,
  whatsapp,
  services,
}: PlaceActionButtonsProps) {
  const whatsappDigits = whatsapp?.replace(/\D/g, "");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {/*
        biome-ignore lint/a11y/useKeyWithClickEvents: this div only wraps
        GetDirectionBtn's own <button> (already fully keyboard-accessible)
        to piggyback an analytics click via bubbling, without modifying
        GetDirectionBtn.tsx itself (reused as-is, per the Places spec).
      */}
      <div onClick={() => logPlaceEngagement(placeId, "direction_click")}>
        <GetDirectionBtn location={location} />
      </div>

      <RequestBookingButton
        placeId={placeId}
        placeName={placeName}
        ownerId={ownerId}
        services={services}
      />

      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={() => logPlaceEngagement(placeId, "phone_click")}
          className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 md:py-3 rounded-lg transition-colors text-sm md:text-base"
        >
          <FiPhone /> Call
        </a>
      )}

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsappDigits}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => logPlaceEngagement(placeId, "whatsapp_click")}
          className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 md:py-3 rounded-lg transition-colors text-sm md:text-base"
        >
          <IoLogoWhatsapp /> WhatsApp
        </a>
      )}
    </div>
  );
}
