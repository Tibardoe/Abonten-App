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
import { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { MdOutlineCancel } from "react-icons/md";
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
import { Button } from "../ui/button";
import ImageCropper from "./ImageCropper";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
};

export default function UploadEventModal({
  handleClosePopup,
}: closePopupModalType) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [cropped, setCropped] = useState<File | null>(null);

  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  const [showPromoCodeFormPopup, setShowPromoCodeFormPopup] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

  const [dateAndTime, setDateAndTime] = useState<
    DateRange | Date[] | undefined
  >({
    from: new Date(),
    to: new Date(),
  });

  const [promoCodes, setPromoCodes] = useState<
    {
      promoCode: string;
      discount: number;
      maximumUse: number;
      expiryDate: Date;
    }[]
  >([]);

  const [singleTicket, setSingleTicket] = useState<number | null>(null);

  const [singleTicketQuantity, setSingleTicketQuantity] = useState<
    number | null
  >(null);

  const [multipleTickets, setMultipleTickets] = useState<Ticket[]>([]);

  const [selectedAddress, setSelectedAddress] = useState("");

  const [category, setCategory] = useState("");

  const [showCrop, setShowCrop] = useState(false);

  const [ticket, setTicket] = useState<string | null>(null);

  const [types, setTypes] = useState<string[]>([]);

  const [dateType, setDateType] = useState("single");

  const [notification, setNotification] = useState<string | null>(null);

  const [checked, setChecked] = useState(false);

  const [paymentOption, setPaymentOption] = useState<string | null>(null);

  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);

  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

  const router = useRouter();

  // At the top of EventUploadMobileModal
  const receivingAccountForm = useForm<z.infer<typeof receivingAccountSchema>>({
    resolver: zodResolver(receivingAccountSchema),
  });

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUploadButton = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setSelectedFile(file);
      setStep((prevStep) => prevStep + 1);
    }
  };

  const handleCategory = (categoryName: string) => {
    setCategory(categoryName);
  };

  const handleTicket = (ticketName: string) => {
    setTicket(ticketName);
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
      }, 5000); // 5 seconds

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

      if (dateType === "single" && !Array.isArray(dateAndTime)) {
        const start = dateAndTime?.from
          ? new Date(dateAndTime.from)
          : undefined;
        const end = dateAndTime?.to ? new Date(dateAndTime.to) : undefined;

        if ((start && start <= bufferedNow) || (end && end <= bufferedNow)) {
          setNotification(
            "Start or end time must be at least 5 hours from now",
          );
          return;
        }

        if (start && end && start >= end) {
          setNotification("Start time must be earlier than end time");
          return;
        }

        eventDates = {
          starts_at: start,
          ends_at: end,
        };
      } else if (Array.isArray(dateAndTime)) {
        const invalid = dateAndTime.some(
          (date) => new Date(date) <= bufferedNow,
        );
        if (invalid) {
          setNotification(
            "All selected dates must be at least 5 minutes from now",
          );
          return;
        }

        eventDates = {
          specific_dates: dateAndTime,
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
    setStep(3);
  };

  return (
    <div className="w-full h-dvh fixed left-0 top-0 bg-black bg-opacity-50 justify-center items-center z-30 hidden md:flex">
      {/* cancel button */}
      <button
        type="button"
        className="absolute top-5 right-5"
        onClick={() => handleClosePopup(false)}
      >
        <MdOutlineCancel className="text-3xl text-white" />
      </button>

      {/* Inner popup */}

      <div className="flex flex-col items-center justify-start bg-white w-[50%] h-[80%] rounded-2xl py-3">
        {step === 1 && (
          <>
            <div className="w-full space-y-3">
              <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                Create new post
              </h1>

              <hr />
            </div>
            <div className="flex flex-col items-center gap-5 my-auto">
              <div className="flex flex-col items-center">
                <Image
                  src="/assets/images/gallery.svg"
                  alt="Gallery"
                  width={100}
                  height={100}
                />
                <p className="text-lg">Upload avatar here</p>
              </div>

              <input
                type="file"
                accept="image/*"
                hidden
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <Button
                className="p-6 text-lg rounded-xl"
                onClick={handleUploadButton}
              >
                Upload flyer
              </Button>
            </div>
          </>
        )}

        {step === 2 && imagePreview && (
          <>
            <div className="w-full space-y-3">
              <div className="flex justify-between w-[90%] mx-auto">
                <button
                  type="button"
                  onClick={() => setStep((prevStep) => prevStep - 1)}
                >
                  <Image
                    src="/assets/images/moveBack.svg"
                    alt="Back"
                    width={30}
                    height={30}
                  />
                </button>

                <button
                  type="button"
                  className="font-bold"
                  onClick={() => setStep((prevStep) => prevStep + 1)}
                  disabled={isUploading}
                >
                  Next
                </button>
              </div>

              <hr />
            </div>
            <div className="relative flex flex-col items-center gap-5 mt-5 w-[90%] h-[90%]">
              {showCrop ? (
                <ImageCropper
                  imagePreview={imagePreview}
                  handleCropped={handleCropped}
                  handleCancel={() => {
                    handleClosePopup(false);
                  }}
                />
              ) : (
                <div>
                  <button
                    type="button"
                    className="bg-black bg-opacity-50 p-2 rounded-full absolute top-0 right-4"
                    onClick={() => setShowCrop((prevState) => !prevState)}
                  >
                    <ScissorsIcon className="w-5 h-5 text-black" />
                  </button>

                  <Image
                    src={croppedPreview ?? imagePreview}
                    alt="Selected Avatar"
                    width={0}
                    height={0}
                    className="w-full md:w-[50%] object-contain mx-auto"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {step === 3 && imagePreview && (
          <>
            <div className="w-full space-y-3">
              <div className="flex justify-between w-[90%] mx-auto">
                <button
                  type="button"
                  onClick={() => setStep((prevStep) => prevStep - 1)}
                >
                  <Image
                    src="/assets/images/moveBack.svg"
                    alt="Back"
                    width={30}
                    height={30}
                  />
                </button>

                <h1 className="text-gray-500 font-bold text-center text-lg">
                  Create new post
                </h1>

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

            <div className="flex justify-start w-full h-[90%] gap-3">
              <div className="w-1/2 h-full rounded-bl-2xl ">
                <Image
                  src={croppedPreview ?? imagePreview}
                  alt="Selected Avatar"
                  width={0}
                  height={0}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Post details */}

              <form className="space-y-4 w-1/2 overflow-y-scroll py-5 overflow-x-hidden font-normal">
                <PostInput
                  type="text"
                  inputPlaceholder="Title"
                  {...register("title")}
                />
                {errors.title && (
                  <p className="text-red-500 text-sm">{errors.title.message}</p>
                )}

                <PostInput
                  type="text"
                  inputPlaceholder="Description"
                  {...register("description")}
                />
                {errors.description && (
                  <p className="text-red-500 text-sm">
                    {errors.description.message}
                  </p>
                )}

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
                        className="space-y-1 border rounded-md p-2 shadow-md"
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
                        className="space-y-1 border rounded-md p-2 shadow-md"
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

                <div className="space-y-4 text-sm font-normal">
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
                    classname="font-semibold text-slate-700"
                    handleCategory={handleCategory}
                    category={category}
                  />
                  {category === "" && (
                    <p className="text-red-500 text-sm">
                      Select event category
                    </p>
                  )}

                  <TypeFilter
                    selectedTypes={types}
                    selectedCategory={category}
                    classname="font-semibold text-slate-700"
                    handleType={handleType}
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
                      {...register("capacity", { valueAsNumber: true })}
                      className="border w-28 p-2 rounded-md"
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

      <Notification notification={notification} />
    </div>
  );
}
