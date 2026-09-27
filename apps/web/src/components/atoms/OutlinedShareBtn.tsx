"use client";

import PromoterEarnHint from "@/events/atoms/PromoterEarnHint";
import { useEventShare } from "@/hooks/useEventShare";
import { getEventShareUrl } from "@abonten/core/shareUrl";
import React from "react";
import { FiShare2 } from "react-icons/fi";

type ShareProp = {
  title: string;
  address: string;
  eventCode: string;
  eventId?: string;
};

export default function OutlinedShareBtn({
  eventCode,
  address,
  title,
  eventId,
}: ShareProp) {
  const url = getEventShareUrl(eventCode, address);
  const share = useEventShare({ eventId, title, url });

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={share}
        className="w-full flex items-center justify-center gap-2 border border-border bg-background py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
      >
        <FiShare2 className="md:text-lg" />
        Share
      </button>
      {eventId ? <PromoterEarnHint eventId={eventId} /> : null}
    </div>
  );
}
