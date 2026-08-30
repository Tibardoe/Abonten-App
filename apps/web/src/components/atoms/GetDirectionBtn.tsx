"use client";

import { getCurrentPosition } from "@/utils/getCurrentPosition";
import { logger } from "@abonten/core/logger";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import { IoLocationOutline } from "react-icons/io5";

type EventDetailsType = {
  location: string;
};

export default function GetDirectionBtn({ location }: EventDetailsType) {
  const handleGetDirection = async () => {
    try {
      const { coords } = await getCurrentPosition();

      const { latitude, longitude } = coords;

      const { eventLat, eventLng } = parseWKBHex(location);

      const url = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${eventLat},${eventLng}&travelmode=driving`;

      window.open(url, "_blank");
    } catch (error) {
      logger.error("Failed to get directions:", error);

      alert("Could not get directions. Please enable location services.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleGetDirection}
      className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 md:py-3 rounded-lg transition-colors text-sm md:text-base"
    >
      <IoLocationOutline /> Get Directions
    </button>
  );
}
