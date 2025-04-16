"use client";

import { CldImage } from "next-cloudinary";
import React from "react";

type FlyerProp = {
  flyerUrl: string;
};

export default function EventCardFlyerImage({ flyerUrl }: FlyerProp) {
  return (
    <CldImage
      src={flyerUrl}
      alt="Event flyer"
      width={500}
      height={500}
      className="w-full h-[300px] md:h-[350px] object-cover"
    />
  );
}
