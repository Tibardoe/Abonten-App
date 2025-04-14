import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import Image from "next/image";
import { useState } from "react";
import { cn } from "../lib/utils";

type CategoryType = {
  category: string;
  handleCategory: (categoryName: string) => void;
};

export default function CategoryFilter({
  handleCategory,
  category,
}: CategoryType) {
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  return (
    <div className="space-y-2">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowCategoryDropdown((prevState) => !prevState)}
          className="flex gap-2 justify-between w-full items-center"
        >
          <h2 className="font-bold md:text-lg">Category</h2>
          <Image
            src="/assets/images/arrowDown.svg"
            alt="Dropdown menu"
            width={30}
            height={30}
          />
        </button>

        {showCategoryDropdown && (
          <div className="space-y-5">
            {eventCategoriesAndTypes.map((categories) => (
              <button
                key={categories.category}
                type="button"
                onClick={() => handleCategory(categories.category)}
                className="flex justify-between items-center w-full text-sm font-semibold text-slate-700"
              >
                {categories.category}
                <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-black">
                  <span
                    className={cn("bg-black w-[10px] h-[10px] rounded-full", {
                      hidden: categories.category !== category,
                      flex: categories.category === category,
                    })}
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
