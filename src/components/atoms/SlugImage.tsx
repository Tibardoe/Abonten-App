"use client";

import { CldImage } from "next-cloudinary";
import React from "react";

type FlyerProp = {
  flyerUrl: string;
};

export default function SlugImage({ flyerUrl }: FlyerProp) {
  return (
    <CldImage
      src={flyerUrl}
      alt="Event flyer"
      width={500}
      height={500}
      className="w-full md:w-[700px] md:h-[700px] rounded-xl"
    />
  );
}
