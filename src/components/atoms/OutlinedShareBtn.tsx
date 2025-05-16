"use client";

import { handleShare } from "@/utils/handleShare";
import { getEventShareUrl } from "@/utils/shareUrl";
import Image from "next/image";
import React from "react";
import { Button } from "../ui/button";

type ShareProp = {
  title: string;
  address: string;
};

export default function OutlinedShareBtn({ title, address }: ShareProp) {
  const url = getEventShareUrl(title, address);

  return (
    <Button
      variant="outline"
      onClick={() => handleShare({ title, url })}
      className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
    >
      <Image
        src="/assets/images/share.svg"
        alt="Share"
        width={30}
        height={30}
      />
      Share
    </Button>
  );
}
