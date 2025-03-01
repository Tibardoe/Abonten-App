"use client";

import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import Image from "next/image";

type AddressProp = {
  placeholderText: AutoCompletePlaceholderType;
};

export default function AutoComplete({ placeholderText }: AddressProp) {
  return (
    <div className="bg-white rounded-lg flex items-center py-4 px-2 gap-2">
      <Image
        className="w-5 h-5 md:w-6 md:h-6 lg:h-8 lg:w-8"
        src={placeholderText.svgUrl}
        alt="Location image"
        width={30}
        height={30}
      />
      <input
        type="text"
        placeholder={placeholderText.text}
        className="text-black text-xl outline-none md:min-w-[400px]"
      />
    </div>
  );
}
