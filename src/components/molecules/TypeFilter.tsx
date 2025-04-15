"use client";

import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import Image from "next/image";
import { useState } from "react";

type TypeFIlter = {
  selectedCategory: string;
  selectedTypes: string[];
  handleType: (type: string) => void;
  classname?: string;
};

export default function TypeFilter({
  selectedCategory,
  selectedTypes,
  handleType,
  classname,
}: TypeFIlter) {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  return (
    <div className="space-y-2">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowTypeDropdown((prevState) => !prevState)}
          className="flex gap-2 justify-between w-full items-center"
        >
          <h2 className={`${classname}`}>Type</h2>
          <Image
            src="/assets/images/arrowDown.svg"
            alt="Dropdown menu"
            width={30}
            height={30}
          />
        </button>

        {showTypeDropdown && (
          <div className="space-y-5">
            {eventCategoriesAndTypes
              .find((c) => c.category === selectedCategory)
              ?.types.map((typeItem) => (
                <button
                  key={typeItem}
                  type="button"
                  onClick={() => handleType(typeItem)}
                  className="flex justify-between items-center w-full text-sm font-semibold text-slate-700"
                >
                  {typeItem}

                  <span className="w-[20px] h-[20px] rounded grid place-items-center border border-black">
                    {selectedTypes.includes(typeItem) && (
                      <span className="w-full h-full bg-black rounded-sm relative">
                        <span className="w-[7px] h-[12px] border-r-2 border-b-[3px] border-white rotate-45 absolute top-[10%] left-1/2 -translate-x-1/2" />
                      </span>
                    )}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
