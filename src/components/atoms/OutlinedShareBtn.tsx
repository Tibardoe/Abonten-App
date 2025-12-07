"use client";

import { handleShare } from "@/utils/handleShare";
import { getEventShareUrl } from "@/utils/shareUrl";
import React from "react";
import { FiShare2 } from "react-icons/fi";

type ShareProp = {
  title: string;
  address: string;
  eventCode: string;
};

export default function OutlinedShareBtn({
  eventCode,
  address,
  title,
}: ShareProp) {
  const url = getEventShareUrl(eventCode, address);

  return (
    <button
      type="button"
      onClick={() => handleShare({ title, url })}
      // className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
      className="w-full flex items-center justify-center gap-2 bg-black text-mint py-3 rounded-lg text-sm hover:bg-gray-800 transition-colors"
    >
      <FiShare2 className="md:text-lg" />
      Share
    </button>
  );
}
