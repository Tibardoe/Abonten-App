import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import { postEvent } from "@/actions/postEvent";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import type { EventDates } from "@/types/postsType";
import type { Ticket } from "@/types/ticketType";
import { type EventSchema, getEventSchema } from "@/utils/eventSchema";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { isImageFile } from "@/utils/isImageFile";
import { receivingAccountSchema } from "@/utils/receivingAcountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ScissorsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { MdOutlineCancel } from "react-icons/md";
import { TbWorld } from "react-icons/tb";
import type { z } from "zod";
import DateTimeSelectorBtn from "../atoms/DateTimeSelectorBtn";
import MaskIcon from "../atoms/MaskIcon";
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

type Entry = { start: Date; end: Date };

export default function UploadEventModal({
  handleClosePopup,
}: closePopupModalType) {
  useBodyScrollLock(true);

  const t = useTranslations("events");

  const eventSchema = useMemo(() => getEventSchema(t), [t]);

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Gates the flyer preview screen so a spinner shows while a newly-selected
  // image decodes, instead of leaving the user staring at a blank frame —
  // mirrors the isPreviewReady pattern used in HighlightModal.
  const [isFlyerPreviewReady, setIsFlyerPreviewReady] = useState(false);

  const [cropped, setCropped] = useState<File | null>(null);

  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  const [showPromoCodeFormPopup, setShowPromoCodeFormPopup] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

  const [dateAndTime, setDateAndTime] = useState<
    DateRange | Entry[] | undefined
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

  const form = useForm<EventSchema>({
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
      const countryMetadata = await fetchCountryMetadata();
      return countryMetadata?.currency ?? "GHS";
    },
  });

  const handleUploadButton = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!isImageFile(file)) {
      setNotification("Please select an image file for your event flyer.");
      return;
    }

    // A brand new file starts a fresh editing session — any crop/edit state
    // left over from a previously-selected flyer must not carry into it.
    // Without this, a stale `cropped` file from an earlier selection could
    // silently be the one that actually gets uploaded (onSubmit falls back
    // to `cropped ?? selectedFile`), and/or the crop tool could reopen
    // unexpectedly for an image the user never chose to crop.
    setShowCrop(false);
    setCropped(null);
    setCroppedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIsFlyerPreviewReady(false);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setSelectedFile(file);
    setStep((prevStep) => prevStep + 1);
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

  const handleDateAndTime = (date: DateRange | Entry[]) => {
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

  const onSubmit = async (formData: EventSchema) => {
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
          (entry) => entry.start <= bufferedNow || entry.end <= bufferedNow,
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
    setIsFlyerPreviewReady(false);
    // Leave the crop tool now that a crop is done — otherwise navigating
    // Back later would silently reopen it instead of showing the result.
    setShowCrop(false);
    setStep(3);
  };

  return (
    <div className="w-full h-dvh fixed left-0 top-0 bg-overlay/50 justify-center items-center z-30 hidden md:flex">
      {/* cancel button */}
      <button
        type="button"
        className="absolute top-5 right-5"
        onClick={() => handleClosePopup(false)}
      >
        <MdOutlineCancel className="text-3xl text-white" />
      </button>

      {/* Inner popup */}

      <div className="flex flex-col items-center justify-start bg-card text-card-foreground w-[70%] h-[95%] rounded-2xl py-3">
        {step === 1 && (
          <>
            <div className="w-full space-y-3">
              <h1 className="text-muted-foreground font-bold text-center pb-1 text-lg">
                Create new post
              </h1>

              <hr className="border-border" />
            </div>
            <div className="flex flex-col items-center gap-5 my-auto">
              <div className="flex flex-col items-center">
                <MaskIcon
                  src="/assets/images/gallery.svg"
                  alt="Gallery"
                  className="w-[100px] h-[100px]"
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
                className="p-6 text-lg rounded-xl bg-mint"
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
                  <MaskIcon
                    src="/assets/images/moveBack.svg"
                    alt="Back"
                    className="w-[30px] h-[30px]"
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

              <hr className="border-border" />
            </div>

            {showCrop ? (
              <div className="relative flex flex-col items-center w-[90%] flex-1 min-h-0 overflow-y-auto">
                <ImageCropper
                  imagePreview={imagePreview}
                  handleCropped={handleCropped}
                  handleCancel={() => {
                    // Leave the crop tool itself, not just the step —
                    // otherwise the next time step 2 renders (e.g. after
                    // picking a different flyer) it would reopen the
                    // cropper instead of showing the plain preview.
                    setShowCrop(false);
                    setStep((prevStep) => prevStep - 1);
                  }}
                />
              </div>
            ) : (
              // Bounded by flex-1/min-h-0 (remaining modal height after the
              // nav bar above) rather than sized off image width alone —
              // otherwise a tall flyer (e.g. a phone screenshot) scales to
              // the container's width and its height runs off the bottom of
              // the modal, uncontained. `fill` + object-contain then shrinks
              // the image to fit fully inside that bounded box either way.
              <div className="relative w-[40%] flex-1 min-h-0 mx-auto">
                <button
                  type="button"
                  className="backdrop-blur-md border border-white/20 bg-black bg-opacity-75 p-2 rounded-full absolute top-1 left-5 z-10"
                  onClick={() => setShowCrop((prevState) => !prevState)}
                >
                  <ScissorsIcon className="w-5 h-5 text-white" />
                </button>

                {!isFlyerPreviewReady && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border-4 border-mint border-t-transparent animate-spin rounded-full w-10 h-10" />
                  </div>
                )}

                <Image
                  src={croppedPreview ?? imagePreview}
                  alt="Selected flyer"
                  fill
                  className={`object-contain ${isFlyerPreviewReady ? "" : "hidden"}`}
                  onLoad={() => setIsFlyerPreviewReady(true)}
                />
              </div>
            )}
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
                  <MaskIcon
                    src="/assets/images/moveBack.svg"
                    alt="Back"
                    className="w-[30px] h-[30px]"
                  />
                </button>

                <h1 className="text-muted-foreground font-bold text-center text-lg">
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

              <hr className="border-border" />
            </div>

            <div className="flex justify-start w-full h-[90%] gap-3">
              <div className="relative w-1/2 h-full rounded-bl-2xl overflow-hidden">
                <Image
                  src={croppedPreview ?? imagePreview}
                  alt="Selected flyer"
                  fill
                  // object-contain, not object-cover: this is still the same
                  // flyer the user selected/cropped, not a decorative
                  // thumbnail — it must show the complete image, not a
                  // portion cropped to fill the box.
                  className="object-contain"
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
                  <p className="text-destructive text-sm">
                    {errors.title.message}
                  </p>
                )}

                <PostInput
                  type="text"
                  inputPlaceholder="Description"
                  {...register("description")}
                />
                {errors.description && (
                  <p className="text-destructive text-sm">
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
                  <p className="text-destructive text-sm">Location required</p>
                )}

                {/* Date and time */}
                <div className="space-y-4 text-sm">
                  <h2>Date & Time</h2>
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
                  {dateAndTime === undefined && (
                    <p className="text-sm text-red-600">
                      Please select date(s) and time(s)
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
                    handleCategory={handleCategory}
                    category={category}
                  />
                  {category === "" && (
                    <p className="text-destructive text-sm">
                      Select event category
                    </p>
                  )}

                  <TypeFilter
                    selectedTypes={types}
                    selectedCategory={category}
                    handleType={handleType}
                  />
                  {types.length === 0 && (
                    <p className="text-destructive text-sm">
                      Select at least one type for event
                    </p>
                  )}

                  <div className="flex justify-between items-center">
                    <div className="bg-background border border-input rounded-md">
                      <input
                        type="text"
                        placeholder="Website"
                        className="rounded-md p-2 bg-transparent"
                        {...register("website_url")}
                      />
                    </div>

                    <TbWorld className="text-2xl" />
                  </div>
                  {errors.website_url && (
                    <p className="text-destructive text-sm">
                      {errors.website_url.message}
                    </p>
                  )}

                  <div className="flex justify-between items-center font-semibold text-foreground">
                    <span>Capacity</span>

                    <input
                      type="number"
                      placeholder="0 if any"
                      {...register("capacity", { valueAsNumber: true })}
                      className="border border-input bg-background w-28 p-2 rounded-md"
                    />
                  </div>
                  {errors.capacity && (
                    <p className="text-destructive text-sm">
                      {errors.capacity.message}
                    </p>
                  )}

                  <hr className="border-border" />
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
