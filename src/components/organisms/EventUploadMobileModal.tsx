"use client";

import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import Image from "next/image";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import PostAutoComplete from "../atoms/PostAutoComplete";
import PostInput from "../atoms/PostInput";
import AutoComplete from "../molecules/AutoComplete";
import CategoryFilter from "../molecules/CategoryFilter";
import DateTimePicker from "../molecules/DateTimePicker";
import TypeFilter from "../molecules/TypeFilter";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
  imgUrl: string | null;
  selectedFile: File | null;
  className?: React.HTMLAttributes<HTMLDivElement>;
};

export default function EventUploadMobileModal({
  handleClosePopup,
  imgUrl,
  selectedFile,
  className,
}: closePopupModalType) {
  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

  const [category, setCategory] = useState("");

  const [types, setTypes] = useState<string[]>([]);

  const [dateAndTime, setDateAndTime] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  const [selectedAddress, setSelectedAddress] = useState("");

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

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setIsUploading(true);

    try {
      await saveAvatarToCloudinary(selectedFile);
      alert("Upload successful!");
      handleClosePopup(false);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDateAndTime = (date: DateRange) => {
    setDateAndTime(date);
  };

  return (
    <div className="fixed left-0 top-0 z-30 w-full h-dvh bg-white flex flex-col items-center gap-5 md:hidden">
      {step === 1 && imgUrl && (
        <>
          <div className="w-full space-y-5">
            <div className="w-[90%] flex justify-between mt-5 mx-auto">
              <button type="button" onClick={() => handleClosePopup(false)}>
                <Image
                  src="/assets/images/cancel.svg"
                  alt="Cancel"
                  width={15}
                  height={15}
                />
              </button>

              <h1 className="font-bold text-lg">New Post</h1>

              <button
                type="button"
                className="font-bold"
                onClick={() => setStep((prevValue) => prevValue + 1)}
              >
                Next
              </button>
            </div>

            <hr />
          </div>

          <div className="w-[70%]">
            <div className="w-full">
              <Image
                src={imgUrl}
                alt="Selected Avatar"
                width={200}
                height={200}
                className="w-full"
              />
            </div>
          </div>
        </>
      )}

      {step === 2 && imgUrl && (
        <>
          <div className="w-full space-y-5">
            <div className="w-[90%] flex justify-between mt-5 mx-auto">
              <button
                type="button"
                onClick={() => setStep((prevValue) => prevValue - 1)}
              >
                <Image
                  src="/assets/images/moveBack.svg"
                  alt="Cancel"
                  width={30}
                  height={30}
                />
              </button>

              <h1 className="font-bold text-lg">New Post</h1>

              <button
                type="button"
                className="font-bold"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </div>

            <hr />
          </div>

          <div className="overflow-y-scroll space-y-5 w-full">
            {/* image preview */}
            <div className="w-[70%] mx-auto">
              <div className="w-full">
                <Image
                  src={imgUrl}
                  alt="Selected Avatar"
                  width={200}
                  height={200}
                  className="w-full"
                />
              </div>
            </div>

            {/* Post content form */}
            <div className="space-y-4">
              {/* <PostInput inputPlaceholder="Title" /> */}

              <div className="space-y-2">
                <div className="w-full flex justify-between items-center gap-5 p-3">
                  <input
                    type="text"
                    placeholder="Title"
                    className="bg-transparent outline-none text-md md:textlg lg:text-xl flex-1"
                  />
                </div>

                <hr />
              </div>

              <PostInput inputPlaceholder="Description" />

              <div className="space-y-4 px-3">
                <PostAutoComplete
                  address={{ address: setSelectedAddress }}
                  placeholderText={{
                    text: "Location",
                    svgUrl: "assets/images/location.svg",
                  }}
                />

                <DateTimePicker handleDateAndTime={handleDateAndTime} />

                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Fee"
                      className="outline-none bg-black bg-opacity-5 w-20 p-2 rounded-md"
                    />

                    <button
                      type="button"
                      className="border border-black p-2 rounded-md px-4"
                    >
                      Free
                    </button>
                  </div>

                  <span>GHS</span>
                </div>

                <CategoryFilter
                  handleCategory={handleCategory}
                  category={category}
                  classname="md:text-lg"
                />

                <TypeFilter
                  selectedTypes={types}
                  selectedCategory={category}
                  handleType={handleType}
                  classname="md:text-lg"
                />

                <div className="flex justify-between items-center">
                  <input type="text" placeholder="Website" />

                  <Image
                    src="/assets/images/website.svg"
                    alt="Website"
                    width={30}
                    height={30}
                  />
                </div>

                <div className="flex justify-between items-center">
                  <span>Capacity</span>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="border border-black p-2 rounded-md px-4"
                    >
                      Any
                    </button>

                    <input
                      type="number"
                      className="outline-none bg-black bg-opacity-5 w-20 p-2 rounded-md"
                    />
                  </div>
                </div>

                <hr />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
