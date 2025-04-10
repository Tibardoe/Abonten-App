"use client";

import Image from "next/image";
import React, { useState } from "react";
import RangeSlider from "react-range-slider-input";
import "react-range-slider-input/dist/style.css";

type FilterModalPopupProp = {
  handlePopup: (state: boolean) => void;
};

export default function FilterModalPopup({
  handlePopup,
}: FilterModalPopupProp) {
  const [minMax, setMinMax] = useState<[number, number]>([0, 20]);

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

            <button type="button" className="flex md:hidden">
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
        <div className="mt-5 w-[90%] md:w-full mx-auto md:px-5 space-y-5">
          <h2 className="font-bold text-xl">Sort by</h2>

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
              <div className="space-y-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}
