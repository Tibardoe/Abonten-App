"use client";

import { generateSlug } from "@/utils/geerateSlug";
// import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { IoSearch } from "react-icons/io5";
import { VscSettings } from "react-icons/vsc";
import FilterModalPopup from "../organisms/FilterModalPopup";

export default function FilterSearchBar() {
  const [showPopup, setShowPopup] = useState(false);

  const [searchText, setSearchText] = useState("");

  const handleShowPopup = (state: boolean) => {
    setShowPopup(state);
  };
  return (
    <div className="w-full md:w-fit bg-slate-100 rounded-lg flex justify-between p-3">
      <div className="flex items-center gap-5">
        <Link href={`/search/${generateSlug(searchText) ?? ""}`}>
          <IoSearch className="text-2xl md:text-3xl" />
        </Link>

        <input
          type="text"
          placeholder="Explore events"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="outline-none text-lg bg-transparent mr-5"
        />
      </div>

      <button type="button" onClick={() => handleShowPopup(true)}>
        <VscSettings className="text-3xl md:text-4xl" />
      </button>

      {showPopup && <FilterModalPopup handlePopup={handleShowPopup} />}
    </div>
  );
}
