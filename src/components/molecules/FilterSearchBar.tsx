"use client";

import Image from "next/image";
import { useState } from "react";
import FilterModalPopup from "../organisms/FilterModalPopup";

export default function FilterSearchBar() {
  const [showPopup, setShowPopup] = useState(false);

  const handleShowPopup = (state: boolean) => {
    setShowPopup(state);
  };
  return (
    <div className="w-full md:w-fit bg-black bg-opacity-10 rounded-lg flex justify-between p-3">
      <div className="flex gap-5">
        <Image
          className="w-[25px] h-[25px] md:w-[30px] md:h-[30px]"
          src="/assets/images/search.svg"
          alt="Search icon"
          width={40}
          height={40}
        />
        <input
          type="text"
          placeholder="Explore events"
          className="outline-none text-lg bg-transparent mr-5"
        />
      </div>

      <button type="button" onClick={() => handleShowPopup(true)}>
        <Image
          className="w-[25px] h-[25px] md:w-[30px] md:h-[30px]"
          src="/assets/images/filter.svg"
          alt="Search icon"
          width={40}
          height={40}
        />
      </button>

      {showPopup && <FilterModalPopup handlePopup={handleShowPopup} />}
    </div>
  );
}
