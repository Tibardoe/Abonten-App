"use client";

import { postEvent } from "@/actions/postEvent";
import type { EventDates } from "@/types/postsType";
import type { Ticket } from "@/types/ticketType";
import { eventSchema } from "@/utils/eventSchema";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { getUserCurrency } from "@/utils/getUserCurrency";
import { receivingAccountSchema } from "@/utils/receivingAcountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ScissorsIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { CiCrop } from "react-icons/ci";
import { LiaTimesSolid } from "react-icons/lia";
import {
  MdArrowBackIos,
  MdArrowForwardIos,
  MdCancel,
  MdNavigateNext,
  MdOutlineNavigateNext,
} from "react-icons/md";
import { TbWorld } from "react-icons/tb";
import type { z } from "zod";
import DateTimeSelectorBtn from "../atoms/DateTimeSelectorBtn";
import Notification from "../atoms/Notification";
import PostAutoComplete from "../atoms/PostAutoComplete";
import PostInput from "../atoms/PostInput";
import PromoCodeBtn from "../atoms/PromoCodeBtn";
import { cn } from "../lib/utils";
import CategoryFilter from "../molecules/CategoryFilter";
import DateTimePicker from "../molecules/DateTimePicker";
import PromoCodeInputs from "../molecules/PromoCodeInputs";
import ReceivingAccountForms from "../molecules/ReceivingAccountForms";
import TicketInputs from "../molecules/TicketInputs";
import TicketType from "../molecules/TicketType";
import TypeFilter from "../molecules/TypeFilter";
import ImageCropper from "./ImageCropper";

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
}: // selectedFile,
// className,
closePopupModalType) {
  const [isUploading, setIsUploading] = useState(false);

  const [cropped, setCropped] = useState<File | null>(null);

  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  const [step, setStep] = useState(1);

  const [showCrop, setShowCrop] = useState(false);

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

  // const [dateAndTime, setDateAndTime] = useState<
  //   DateRange | Date[] | undefined
  // >({
  //   from: new Date(),
  //   to: new Date(),
  // });

  const [singleDateRange, setSingleDateRange] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  });

  const [multipleDates, setMultipleDates] = useState<Date[]>([]);

  const [selectedAddress, setSelectedAddress] = useState("");

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

  const [singleTicketQuantity, setSingleTicketQuantity] = useState<
    number | null
  >(null);

  const [multipleTickets, setMultipleTickets] = useState<Ticket[]>([]);

  const handleTicket = (ticketName: string) => {
    setTicket(ticketName);
  };

  const [showPromoCodeFormPopup, setShowPromoCodeFormPopup] = useState(false);

  const [notification, setNotification] = useState<string | null>(null);

  const [dateType, setDateType] = useState("single");

  const [checked, setChecked] = useState(false);

  const [paymentOption, setPaymentOption] = useState<string | null>(null);

  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);

  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

  const router = useRouter();

  // At the top of EventUploadMobileModal
  const receivingAccountForm = useForm<z.infer<typeof receivingAccountSchema>>({
    resolver: zodResolver(receivingAccountSchema),
  });

  const { data: userCurrency } = useQuery({
    queryKey: ["user-currency"],
    queryFn: async () => {
      const userCurrency = await getUserCurrency();

      if (userCurrency) {
        return userCurrency;
      }

      return null;
    },
  });

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

  // const handleDateAndTime = (date: DateRange | Date[]) => {
  //   setDateAndTime(date);
  // };

  const handleDateAndTime = (date: DateRange | Date[]) => {
    if (dateType === "single" && !Array.isArray(date)) {
      setSingleDateRange(date);
    } else if (dateType === "specific" && Array.isArray(date)) {
      setMultipleDates(date);
    }
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
    try {
      setIsUploading(true);

      if (!cropped && !selectedFile) {
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

      const now = new Date();
      const bufferMs = 5 * 60 * 60 * 1000; // 5 hours
      const bufferedNow = new Date(now.getTime() + bufferMs);

      if (dateType === "single") {
        const start = singleDateRange?.from
          ? new Date(singleDateRange.from)
          : undefined;
        const end = singleDateRange?.to
          ? new Date(singleDateRange.to)
          : undefined;

        if (!start || !end) {
          setNotification("Please select both start and end date");
          return;
        }

        if (start <= bufferedNow || end <= bufferedNow) {
          setNotification(
            "Start or end time must be at least 5 hours from now",
          );
          return;
        }

        if (start >= end) {
          setNotification("Start time must be earlier than end time");
          return;
        }

        eventDates = {
          starts_at: start,
          ends_at: end,
        };
      } else if (dateType === "specific") {
        if (!multipleDates || multipleDates.length === 0) {
          setNotification("Please select at least one date");
          return;
        }

        const invalid = multipleDates.some(
          (date) => new Date(date) <= bufferedNow,
        );
        if (invalid) {
          setNotification(
            "All selected dates must be at least 5 hours from now",
          );
          return;
        }

        eventDates = {
          specific_dates: multipleDates,
        };
      } else {
        setNotification("Invalid date selection");
        return;
      }

      if (!category || !types) {
        setNotification("Categories and types must be set");
        return;
      }

      const noTicketingSet =
        !ticket &&
        (!singleTicket || !singleTicketQuantity) &&
        (!multipleTickets || multipleTickets.length === 0);

      if (noTicketingSet) {
        setNotification("Event ticketing must be set");
        return;
      }

      const receivingAccountDetails = receivingAccountForm.getValues();

      const isReceivingAccountEmpty = Object.values(
        receivingAccountDetails,
      ).some((value) => !value);

      const isPaidTicketing =
        (singleTicket && singleTicketQuantity) ||
        (multipleTickets && multipleTickets.length > 0);

      if (isPaidTicketing && ticket !== "free" && isReceivingAccountEmpty) {
        setNotification(
          "Set up receiving account to receive payment after successfull event!",
        );
        return;
      }

      const fileToUpload = (cropped ?? selectedFile) as File;

      const finalData = {
        ...formData,
        address: selectedAddress,
        latitude: coords.lat,
        longitude: coords.lng,
        category,
        types,
        selectedFile: fileToUpload,
        promoCodes,
        freeEvents: ticket,
        singleTicket,
        singleTicketQuantity,
        multipleTickets,
        currency: userCurrency,
        checked,
        paymentOption,
        receivingAccountDetails,
        selectedNetwork,
        ...eventDates, // Merge the eventDates
      };

      setIsUploading(true);
      const response = await postEvent(finalData);
      setIsUploading(false);

      if (response.status === 200) {
        setNotification("✅ Event posted successfully!");
        router.refresh();
        handleClosePopup(false);
      } else {
        setNotification(`❌ ${response.message}`);
      }
    } catch (error) {
      setNotification("Location unknown! Try again with different location");
      setIsUploading(false);
    } finally {
      setIsUploading(false);
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

  const handleSingleTicketQuantity = (amount: number) => {
    setSingleTicketQuantity(amount);
  };

  const handleMultipleTickets = (tickets: Ticket[]) => {
    setMultipleTickets(tickets);
  };

  const handlePromoCodeFormPopup = () => {
    setShowPromoCodeFormPopup((prevState) => !prevState);
  };

  const handleChecked = () => {
    setChecked((prevState) => !prevState);
  };

  const handlePaymentOption = (option: string) => setPaymentOption(option);

  const handleSelectedNetwork = (network: string) => {
    setSelectedNetwork(network);
    setShowNetworkDropdown(false);
  };

  const handleNetworkDropdown = () => {
    setShowNetworkDropdown((prevState) => !prevState);
  };

  const handleCropped = (croppedFile: File) => {
    setCropped(croppedFile);
    const preview = URL.createObjectURL(croppedFile);
    setCroppedPreview(preview);
    setStep(2);
  };

  return (
    <div className="fixed left-0 top-0 z-30 w-full h-full bg-white flex flex-col items-center md:hidden">
      {step === 1 && imgUrl && !showCrop && (
        <div className="relative w-full h-full flex justify-center items-center">
          {/* Top Controls */}
          <div className="absolute top-3 left-0 w-full flex justify-between px-3 z-20">
            <button
              type="button"
              onClick={() => handleClosePopup(false)}
              className="backdrop-blur-md border border-white/20 bg-black bg-opacity-75 p-2 rounded-full"
              aria-label="Close popup"
            >
              <LiaTimesSolid className="text-white text-xl font-bold" />
            </button>

            <button
              type="button"
              onClick={() => setStep((prevStep) => prevStep + 1)}
              className="backdrop-blur-md border border-white/20 bg-black bg-opacity-75 p-2 rounded-full"
              aria-label="Next step"
            >
              <MdArrowForwardIos className="text-white text-xl" />
            </button>
          </div>

          {/* Crop Button */}
          <button
            type="button"
            className="absolute z-20 backdrop-blur-md border border-white/20 bg-black bg-opacity-75 p-2 rounded-full top-14 right-3"
            onClick={() => setShowCrop((prev) => !prev)}
            aria-label="Crop image"
          >
            <CiCrop className="w-5 h-5 text-white" />
          </button>

          {/* Image */}
          <div className="relative w-full h-full">
            <Image
              src={croppedPreview ?? imgUrl}
              alt="Selected Avatar"
              fill
              className="object-contain w-full mx-auto"
            />
          </div>
        </div>
      )}

      {step === 1 && imgUrl && showCrop && (
        <div className="absolute inset-0 z-30 w-full h-full bg-white pt-5">
          <ImageCropper
            imagePreview={imgUrl}
            handleCropped={handleCropped}
            handleCancel={() => setShowCrop(false)}
          />
        </div>
      )}

      {step === 2 && imgUrl && (
        <>
          <div className="w-full space-y-5">
            <div className="w-[90%] flex justify-between mt-5 mx-auto">
              <button
                type="button"
                onClick={() => setStep((prevValue) => prevValue - 1)}
              >
                <MdArrowBackIos className="text-xl" />
              </button>

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
                  src={croppedPreview ?? imgUrl}
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
                <div>
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
                </div>

                {/* Date and time */}
                <div className="space-y-4 text-sm">
                  <h2 className="font-bold text-slate-700">Date & Time</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <DateTimeSelectorBtn
                      dateType="single"
                      currentType={dateType}
                      title="Single/Range"
                      text="One date or continuous range"
                      onClick={setDateType}
                    />

                    <DateTimeSelectorBtn
                      dateType="specific"
                      currentType={dateType}
                      title="Multiple Dates"
                      text="Set specific non-consecutive dates"
                      onClick={setDateType}
                    />
                  </div>

                  <DateTimePicker
                    handleDateAndTime={handleDateAndTime}
                    dateType={dateType}
                  />
                  {/* {dateAndTime === undefined && (
                    <p className="text-sm text-red-600">
                      Please select date(s) and time(s)
                    </p>
                  )} */}
                </div>

                <div className="space-y-3">
                  <TicketType
                    handleTicket={handleTicket}
                    ticket={ticket}
                    checked={checked}
                    handleChecked={handleChecked}
                  />

                  {ticket === "Single Ticket Type" && (
                    <TicketInputs
                      ticketType={ticket}
                      singleTicketPrice={singleTicket}
                      handleSingleTicket={handleSingleTicket}
                      singleTicketQuantity={singleTicketQuantity}
                      handleSingleTicketQuantity={handleSingleTicketQuantity}
                    />
                  )}

                  {ticket === "Multiple Ticket Types" && (
                    <TicketInputs
                      ticketType={ticket}
                      handleMultipleTickets={handleMultipleTickets}
                    />
                  )}

                  {(ticket === "Single Ticket Type" ||
                    ticket === "Multiple Ticket Types") && (
                    <ReceivingAccountForms
                      form={receivingAccountForm}
                      handlePaymentOption={handlePaymentOption}
                      paymentOption={paymentOption}
                      handleSelectedNetwork={handleSelectedNetwork}
                      selectedNetwork={selectedNetwork}
                      showNetworkDropdown={showNetworkDropdown}
                      setShowNetworkDropdown={handleNetworkDropdown}
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

                <div>
                  <CategoryFilter
                    handleCategory={handleCategory}
                    category={category}
                    classname="md:text-lg font-semibold text-slate-700"
                  />
                  {category === "" && (
                    <p className="text-red-500 text-sm">
                      Select event category
                    </p>
                  )}
                </div>

                <div>
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
                </div>

                <div className="flex justify-between items-center">
                  <div className="bg-white border rounded-md">
                    <input
                      type="text"
                      placeholder="Website"
                      className="rounded-md p-2 font-semibold text-slate-700"
                      {...register("website_url")}
                    />
                  </div>

                  <TbWorld className="text-2xl" />
                </div>
                {errors.website_url && (
                  <p className="text-red-500 text-sm">
                    {errors.website_url.message}
                  </p>
                )}

                <div className="flex justify-between items-center font-semibold text-slate-700">
                  <span>Capacity</span>

                  <input
                    type="number"
                    placeholder="0 if any"
                    className="border w-28 p-2 rounded-md"
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
