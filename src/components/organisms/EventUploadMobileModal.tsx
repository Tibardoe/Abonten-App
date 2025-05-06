"use client";

import { postEvent } from "@/actions/postEvent";
import type { EventDates } from "@/types/postsType";
import type { Ticket } from "@/types/ticketType";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { getUserCurrency } from "@/utils/getUserCurrency";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { TbWorld } from "react-icons/tb";
import { z } from "zod";
import Notification from "../atoms/Notification";
import PostAutoComplete from "../atoms/PostAutoComplete";
import PostInput from "../atoms/PostInput";
import PromoCodeBtn from "../atoms/PromoCodeBtn";
import { cn } from "../lib/utils";
import CategoryFilter from "../molecules/CategoryFilter";
import DateTimePicker from "../molecules/DateTimePicker";
import PromoCodeInputs from "../molecules/PromoCodeInputs";
import TicketInputs from "../molecules/TicketInputs";
import TicketType from "../molecules/TicketType";
import TypeFilter from "../molecules/TypeFilter";

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

  const [dateAndTime, setDateAndTime] = useState<
    DateRange | Date[] | undefined
  >({
    from: new Date(),
    to: new Date(),
  });

  const [selectedAddress, setSelectedAddress] = useState("");

  const [currency, setCurrency] = useState("");

  const [promoCodes, setPromoCodes] = useState<
    {
      promoCode: string;
      discount: number;
      maximumUse: number;
      expiryDate: Date;
    }[]
  >([]);

  const [ticket, setTicket] = useState("");

  const [singleTicket, setSingleTicket] = useState<number | null>(null);

  const [multipleTickets, setMultipleTickets] = useState<Ticket[]>([]);

  const handleTicket = (ticketName: string) => {
    setTicket(ticketName);
  };

  const [showPromoCodeFormPopup, setShowPromoCodeFormPopup] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  const [dateType, setDateType] = useState("single");

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

  const handleDateAndTime = (date: DateRange | Date[]) => {
    setDateAndTime(date);
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000); // 3 seconds

      return () => clearTimeout(timer); // Cleanup
    }
  }, [notification]);

  const onSubmit = async (formData: z.infer<typeof eventSchema>) => {
    if (!selectedFile) {
      setNotification("Please select a file first!");
      return;
    }

    if (!selectedAddress) {
      setNotification("Please enter a location");
      return;
    }

    const coords = await getCoordinatesFromAddress(selectedAddress);

    if (!coords) {
      setNotification("Could not fetch coordinates");
      return;
    }

    let eventDates: EventDates;

    if (dateType === "single" && !Array.isArray(dateAndTime)) {
      eventDates = {
        starts_at: dateAndTime?.from || undefined, // Ensure undefined is set if no value
        ends_at: dateAndTime?.to || undefined, // Ensure undefined is set if no value
      };
    } else if (Array.isArray(dateAndTime)) {
      eventDates = {
        specific_dates: dateAndTime, // Array of dates
      };
    } else {
      setNotification("Invalid date selection");
      return;
    }

    const finalData = {
      ...formData,
      address: selectedAddress,
      latitude: coords.lat,
      longitude: coords.lng,
      category,
      types,
      selectedFile,
      promoCodes,
      freeEvents: ticket,
      singleTicket,
      multipleTickets,
      currency,
      ...eventDates, // Merge the eventDates
    };

    setIsUploading(true);
    const response = await postEvent(finalData);
    setIsUploading(false);

    if (response.status === 200) {
      setNotification("✅ Event posted successfully!");
      handleClosePopup(false);
    } else {
      setNotification(`❌ ${response.message}`);
    }
  };

  const handlePromoCodesChange = (
    updatedPromoCodes: {
      promoCode: string;
      discount: number;
      maximumUse: number;
      expiryDate: Date;
    }[],
  ) => {
    setPromoCodes(updatedPromoCodes);
  };

  const handleSingleTicket = (amount: number) => {
    setSingleTicket(amount);
  };

  const handleMultipleTickets = (tickets: Ticket[]) => {
    setMultipleTickets(tickets);
  };

  const handlePromoCodeFormPopup = (state: boolean) => {
    setShowPromoCodeFormPopup((prevState) => !prevState);
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

                {/* Date and time */}
                <div className="space-y-2 text-sm">
                  <h2 className="font-bold text-slate-700">Date</h2>

                  <div className="space-y-1">
                    <div>
                      <button
                        type="button"
                        className="space-y-1 border rounded-md p-2 shadow-md w-full"
                        onClick={() => setDateType("single")}
                      >
                        <span className="flex justify-between items-center w-full text-slate-700">
                          <p className="font-bold">Single or Range</p>
                          <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-black">
                            <span
                              className={cn(
                                "bg-black w-[10px] h-[10px] rounded-full",
                                {
                                  hidden: dateType !== "single",
                                  flex: dateType === "single",
                                },
                              )}
                            />
                          </span>
                        </span>

                        <p className="text-start text-[13px] text-slate-700">
                          Choose one date or a continuous range (e.g., Feb 21 –
                          Feb 25).
                        </p>
                      </button>
                    </div>

                    <div>
                      <button
                        type="button"
                        className="space-y-1 border rounded-md p-2 shadow-md w-full"
                        onClick={() => setDateType("specific")}
                      >
                        <span className="flex justify-between items-center w-full text-slate-700">
                          <p className="font-bold">Custom Dates</p>
                          <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-black">
                            <span
                              className={cn(
                                "bg-black w-[10px] h-[10px] rounded-full",
                                {
                                  hidden: dateType !== "specific",
                                  flex: dateType === "specific",
                                },
                              )}
                            />
                          </span>
                        </span>

                        <p className="text-start text-[13px] text-slate-700">
                          Set multiple specific dates (e.g., Jan 20, Mar 6, Feb
                          5).
                        </p>
                      </button>
                    </div>
                  </div>

                  <DateTimePicker
                    handleDateAndTime={handleDateAndTime}
                    dateType={dateType}
                  />
                  {dateAndTime === undefined && (
                    <p className="text-red-500 text-sm pl-3">
                      Set date and time
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <TicketType handleTicket={handleTicket} ticket={ticket} />

                  {ticket === "Single Ticket Type" && (
                    <TicketInputs
                      ticketType={ticket}
                      singleTicketPrice={singleTicket}
                      handleSingleTicket={handleSingleTicket}
                    />
                  )}

                  {ticket === "Multiple Ticket Types" && (
                    <TicketInputs
                      ticketType={ticket}
                      handleMultipleTickets={handleMultipleTickets}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <PromoCodeBtn
                    ticket={ticket}
                    handlePromoCodeFormPopup={handlePromoCodeFormPopup}
                  />

                  {showPromoCodeFormPopup && (
                    <PromoCodeInputs
                      onPromoCodesChange={handlePromoCodesChange}
                    />
                  )}
                </div>

                <CategoryFilter
                  handleCategory={handleCategory}
                  category={category}
                  classname="md:text-lg font-semibold text-slate-700"
                />
                {category === "" && (
                  <p className="text-red-500 text-sm">Select event category</p>
                )}

                <TypeFilter
                  selectedTypes={types}
                  selectedCategory={category}
                  handleType={handleType}
                  classname="md:text-lg font-semibold text-slate-700"
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

      <Notification notification={notification} />
    </div>
  );
}
