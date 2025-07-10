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
import { TbWorld } from "react-icons/tb";
import type { z } from "zod";
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

  // const [currency, setCurrency] = useState("");

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

  // useEffect(() => {
  //   const fetchCurrency = async () => {
  //     const userCurrency = await getUserCurrency();
  //     setCurrency(userCurrency);
  //   };

  //   fetchCurrency();
  // }, []);

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
    } else if (dateType === "multiple" && Array.isArray(date)) {
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

      if (!cropped) {
        setNotification("Please select a file first!");
        return;
      }

      if (!cropped) {
        setNotification("Please enter a location");
        return;
      }

      const coords = await getCoordinatesFromAddress(selectedAddress);

      if (!coords) {
        setNotification("Could not fetch coordinates");
        return;
      }

      // let eventDates: EventDates;

      // if (dateType === "single") {
      //   eventDates = {
      //     starts_at: singleDateRange.from,
      //     ends_at: singleDateRange.to,
      //   };
      // } else if (dateType === "multiple") {
      //   eventDates = {
      //     specific_dates: multipleDates,
      //   };
      // } else {
      //   setNotification("Invalid date selection");

      //   return;
      // }

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
      } else if (dateType === "multiple") {
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

      const finalData = {
        ...formData,
        address: selectedAddress,
        latitude: coords.lat,
        longitude: coords.lng,
        category,
        types,
        selectedFile: cropped,
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
    <div className="fixed left-0 top-0 z-30 w-full h-dvh bg-white flex flex-col items-center gap-5 md:hidden overflow-y-scroll">
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
                onClick={() => setStep(1)}
              >
                Next
              </button>
            </div>

            <hr />
          </div>

          <div className="w-full relative">
            {showCrop ? (
              <ImageCropper
                imagePreview={imgUrl}
                handleCropped={handleCropped}
                handleCancel={() => {
                  handleClosePopup(false);
                }}
              />
            ) : (
              <div>
                <button
                  type="button"
                  className="bg-black bg-opacity-50 p-2 rounded-full absolute top-0 right-2"
                  onClick={() => setShowCrop((prevState) => !prevState)}
                >
                  <ScissorsIcon className="w-5 h-5 text-black" />
                </button>

                <Image
                  src={croppedPreview ?? imgUrl}
                  alt="Selected Avatar"
                  width={0}
                  height={0}
                  className="w-[80%] object-contain mx-auto"
                />
              </div>
            )}
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
                  {/* {dateAndTime === undefined && (
                    <p className="text-red-500 text-sm pl-3">
                      Set date and time
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
