"use client";

import { postEvent } from "@/actions/postEvent";
import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { getUserCurrency } from "@/utils/getUserCurrency";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { TbWorld } from "react-icons/tb";
import { z } from "zod";
import PostAutoComplete from "../atoms/PostAutoComplete";
import PostInput from "../atoms/PostInput";
import AutoComplete from "../molecules/AutoComplete";
import CategoryFilter from "../molecules/CategoryFilter";
import DateTimePicker from "../molecules/DateTimePicker";
import TypeFilter from "../molecules/TypeFilter";
import { Button } from "../ui/button";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
  imgUrl: string | null;
  selectedFile: File | null;
  className?: React.HTMLAttributes<HTMLDivElement>;
};

const eventSchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title is required" })
    .max(150, { message: "Title must be less than 150 characters" }),

  description: z.string().min(1, { message: "Description is required" }),

  website_url: z
    .string()
    .refine(
      (val) =>
        val === "" ||
        /^((https?:\/\/)?(www\.)?[a-zA-Z0-9\-]+\.[a-z]{2,})(\/\S*)?$/.test(val),
      {
        message:
          "Enter a valid URL (e.g., www.example.com or https://example.com)",
      },
    )
    .optional(),

  price: z
    .number({ invalid_type_error: "Price must be a number" })
    .min(0, { message: "Price cannot be negative" })
    .optional(),

  capacity: z
    .number({ invalid_type_error: "Capacity must be a number" })
    .int({ message: "Capacity must be a whole number" })
    .positive({ message: "Capacity must be greater than 0" })
    .optional(),
});

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

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const [dateAndTime, setDateAndTime] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  const [selectedAddress, setSelectedAddress] = useState("");

  const [currency, setCurrency] = useState("");

  useEffect(() => {
    const fetchCurrency = async () => {
      const userCurrency = await getUserCurrency();
      setCurrency(userCurrency);
    };

    fetchCurrency();
  }, []);

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

  const handleDateAndTime = (date: DateRange) => {
    setDateAndTime(date);
  };

  const onSubmit = async (formData: z.infer<typeof eventSchema>) => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    if (!selectedAddress) {
      alert("Please enter a location");
      return;
    }

    const coords = await getCoordinatesFromAddress(selectedAddress);

    if (!coords) {
      alert("Could not fetch coordinates");
      return;
    }

    const finalData = {
      ...formData,
      address: selectedAddress,
      latitude: coords.lat,
      longitude: coords.lng,
      category,
      types,
      starts_at: dateAndTime?.from,
      ends_at: dateAndTime?.to,
      selectedFile,
      currency,
    };

    setIsUploading(true);
    const response = await postEvent(finalData);
    setIsUploading(false);

    if (response.status === 200) {
      alert("Event posted successfully!");
      handleClosePopup(false);
    } else {
      alert(`Something went wrong: ${response.message}`);
    }
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
                onClick={handleSubmit(onSubmit)}
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

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <PostInput
                type="text"
                inputPlaceholder="Title"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-red-500 text-sm pl-3">
                  {errors.title.message}
                </p>
              )}

              <PostInput
                type="text"
                inputPlaceholder="Description"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-red-500 text-sm pl-3">
                  {errors.description.message}
                </p>
              )}

              <div className="space-y-4 px-3">
                <PostAutoComplete
                  address={{ address: setSelectedAddress }}
                  placeholderText={{
                    text: "Location",
                    svgUrl: "/assets/images/location.svg",
                  }}
                />
                {selectedAddress === "" && (
                  <p className="text-red-500 text-sm">Location required</p>
                )}

                <DateTimePicker handleDateAndTime={handleDateAndTime} />
                {dateAndTime === undefined && (
                  <p className="text-red-500 text-sm pl-3">Set date and time</p>
                )}

                <div className="flex justify-between items-center">
                  <input
                    type="number"
                    placeholder="0 if free"
                    className="outline-none bg-black bg-opacity-5 w-24 p-2 rounded-md"
                    {...register("price", { valueAsNumber: true })}
                  />

                  <span>{currency}</span>
                </div>
                {errors.price && (
                  <p className="text-red-500 text-sm">{errors.price.message}</p>
                )}

                <CategoryFilter
                  handleCategory={handleCategory}
                  category={category}
                  classname="md:text-lg"
                />
                {category === "" && (
                  <p className="text-red-500 text-sm">Select event category</p>
                )}

                <TypeFilter
                  selectedTypes={types}
                  selectedCategory={category}
                  handleType={handleType}
                  classname="md:text-lg"
                />
                {types.length === 0 && (
                  <p className="text-red-500 text-sm">
                    Select at least one type for event
                  </p>
                )}

                <div className="flex justify-between items-center">
                  <input
                    type="text"
                    className="w-full outline-none"
                    placeholder="Website"
                    {...register("website_url")}
                  />

                  <TbWorld className="text-2xl" />
                </div>
                {errors.website_url && (
                  <p className="text-red-500 text-sm">
                    {errors.website_url.message}
                  </p>
                )}

                <div className="flex justify-between items-center">
                  <span>Capacity</span>

                  <input
                    type="number"
                    placeholder="0 if any"
                    className="outline-none bg-black bg-opacity-5 w-24 p-2 rounded-md"
                    {...register("capacity", { valueAsNumber: true })}
                  />
                </div>
                {errors.capacity && (
                  <p className="text-red-500 text-sm">
                    {errors.capacity.message}
                  </p>
                )}

                <hr />
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
