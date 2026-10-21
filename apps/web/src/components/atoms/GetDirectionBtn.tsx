"use client";

import { useToast } from "@/hooks/useToast";
import { logger } from "@abonten/core/logger";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import { useTranslations } from "next-intl";
import { IoLocationOutline } from "react-icons/io5";

type EventDetailsType = {
  location: string;
};

// Google Maps starts the route from where the visitor is. Asking the
// browser for that position first only made directions fail for anyone who
// had refused location, so the destination alone is sent.
export default function GetDirectionBtn({ location }: EventDetailsType) {
  const t = useTranslations("common");
  const toast = useToast();

  const handleGetDirection = () => {
    try {
      const { eventLat, eventLng } = parseWKBHex(location);

      const url = `https://www.google.com/maps/dir/?api=1&destination=${eventLat},${eventLng}`;

      window.open(url, "_blank", "noopener");
    } catch (error) {
      logger.error("Failed to get directions:", error);

      toast.error(t("couldNotGetDirections"));
    }
  };

  return (
    <button
      type="button"
      onClick={handleGetDirection}
      className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 py-2 md:py-3 rounded-lg transition-colors text-sm md:text-base"
    >
      <IoLocationOutline /> {t("getDirections")}
    </button>
  );
}
