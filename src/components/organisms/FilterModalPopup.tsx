"use client";

import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import Image from "next/image";
import React from "react";
import { useState } from "react";
import RangeSlider from "react-range-slider-input";
import "react-range-slider-input/dist/style.css";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { distance, rating } from "@/data/distanceAndRating";
// Date moodules
import { addDays, format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { cn } from "../lib/utils";
import CategoryFilter from "../molecules/CategoryFilter";
import TypeFilter from "../molecules/TypeFilter";

type FilterModalPopupProp = {
  handlePopup: (state: boolean) => void;
  className?: React.HTMLAttributes<HTMLDivElement>;
};

export default function FilterModalPopup({
  handlePopup,
  className,
}: FilterModalPopupProp) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  const [minMax, setMinMax] = useState<[number, number]>([0, 20]);

  const [category, setCategory] = useState("");

  const [types, setTypes] = useState<string[]>([]);

  const [ratingg, setRating] = useState("");

  const [distancee, setDistance] = useState("");

  const router = useRouter();

  const handleFilter = () => {
    const query = new URLSearchParams({
      price: `GHS ${minMax[0]} - GHS ${minMax[1]}`,
      category,
      types: types.join(","),
      from: date?.from?.toISOString() || "",
      to: date?.to?.toISOString() || "",
      rating: ratingg,
      distance: distancee,
    });

    router.push(`/search?${query.toString()}`);
  };

  const handleReset = () => {
    const now = new Date();

    setDate({ from: now, to: now });

    setMinMax([0, 0]);

    setCategory("");

    setTypes([]);

    setRating("");

    setDistance("");
  };

  const handleCategory = (categoryName: string) => {
    setCategory(categoryName);
  };

  const handleType = (selectedType: string) => {
    setTypes(
      (prevTypes) =>
        prevTypes.includes(selectedType)
          ? prevTypes.filter((t) => t !== selectedType) // Remove if already selected
          : [...prevTypes, selectedType], // Add if not selected
    );
  };

  const handleInputChange = (index: number, value: string) => {
    const num = Number(value);
    const newRange: [number, number] = [...minMax];
    newRange[index] = Number.isNaN(num) ? minMax[index] : num;
    setMinMax(newRange);
  };

  return (
    <div className="fixed top-0 left-0 bg-black bg-opacity-40 h-dvh w-full z-10 flex justify-center items-end md:items-center">
      {/* Popup */}
      <div className="w-full h-[95%] md:w-[50%] bg-white py-5 rounded-t-2xl md:rounded-xl">
        {/* Top elements */}
        <div>
          <div className="flex justify-between items-center w-[90%] md:w-full mx-auto font-bold md:px-5">
            <button
              type="button"
              className="flex md:hidden"
              onClick={() => handlePopup(false)}
            >
              Cancel
            </button>

            <h1 className="md:mx-auto text-xl md:text-2xl">Filter</h1>

            <button
              onClick={handleReset}
              type="button"
              className="flex md:hidden"
            >
              Clear
            </button>

            <button
              type="button"
              className="hidden md:flex"
              onClick={() => handlePopup(false)}
            >
              <Image
                src="/assets/images/circularCancel.svg"
                alt="Cancel"
                width={30}
                height={30}
              />
            </button>
          </div>

          <hr className="mt-3" />
        </div>

        {/* Content */}
        <div className="mt-5 w-[90%] md:w-full mx-auto md:px-5 space-y-5 overflow-y-scroll h-[90%]">
          <h2 className="font-bold md:text-lg">Sort by</h2>

          <div className="space-y-5">
            <div>
              <div className="space-y-3">
                {/* Price and inputs */}
                <div className="flex justify-between items-center">
                  <p>Price</p>

                  <div className="flex gap-3 items-center">
                    <input
                      type="number"
                      value={minMax[0]}
                      min={0}
                      max={minMax[1]}
                      onChange={(e) => handleInputChange(0, e.target.value)}
                      className="w-20 h-8 text-center outline-none bg-gray-200 rounded-lg"
                    />
                    <span>-</span>
                    <input
                      type="number"
                      value={minMax[1]}
                      min={minMax[0]}
                      max={99999}
                      onChange={(e) => handleInputChange(1, e.target.value)}
                      className="w-20 h-8 text-center outline-none bg-gray-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Range slider */}
                <div className="flex justify-between items-center gap-3">
                  <p>${minMax[0]}</p>

                  <RangeSlider
                    min={0}
                    max={999}
                    step={1}
                    value={minMax}
                    onInput={(val) => setMinMax(val as [number, number])}
                    id="range-slider-yellow"
                  />

                  <p>${minMax[1] === 999 ? "Any" : minMax[1]}</p>
                </div>
              </div>

              <hr className="mt-5" />
            </div>

            {/* category */}
            <div>
              <CategoryFilter
                handleCategory={handleCategory}
                category={category}
              />

              <hr className="mt-5" />
            </div>

            {/* types */}
            <div>
              <TypeFilter
                selectedTypes={types}
                selectedCategory={category}
                handleType={handleType}
              />

              <hr className="mt-5" />
            </div>

            {/* date */}
            <div>
              <h2 className="font-bold md:text-lg mb-5">Date</h2>

              <div className={cn("grid gap-2 border", className)}>
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date?.from}
                  selected={date}
                  onSelect={setDate}
                  numberOfMonths={1}
                />
              </div>

              <hr className="mt-5" />
            </div>
          </div>

          {/* Rating */}
          <div>
            <h2 className="font-bold md:text-lg mb-5">Rating</h2>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {rating.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRating(r)}
                  className={cn(
                    "px-4 py-3 bg-slate-200 rounded-lg text-sm md:text-lg",
                    r === ratingg && "bg-black text-white",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            <hr className="mt-5" />
          </div>

          {/* Distance */}
          <div>
            <h2 className="font-bold md:text-lg mb-5">Distance</h2>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {distance.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDistance(d)}
                  className={cn(
                    "px-4 py-3 bg-slate-200 rounded-lg text-sm md:text-lg",
                    distancee === d && "bg-black text-white",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>

            <hr className="mt-5" />
          </div>

          <div className="gap-5 justify-end pb-5 hidden md:flex">
            <Button
              onClick={handleReset}
              className="text-lg py-6 px-8 rounded-full"
            >
              Reset
            </Button>
            <Button
              onClick={handleFilter}
              className="text-lg py-6 px-8 rounded-full"
            >
              Filter
            </Button>
          </div>

          <Button
            onClick={handleFilter}
            className="font-bold w-full rounded-full text-lg md:hidden p-6"
          >
            Filter
          </Button>
        </div>
      </div>
    </div>
  );
}
