import { postEvent } from "@/actions/postEvent";
import type { Ticket } from "@/types/ticketType";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { getUserCurrency } from "@/utils/getUserCurrency";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { TbWorld } from "react-icons/tb";
import { z } from "zod";
import Notification from "../atoms/Notification";
import PostAutoComplete from "../atoms/PostAutoComplete";
import PostInput from "../atoms/PostInput";
import PromoCodeBtn from "../atoms/PromoCodeBtn";
import CategoryFilter from "../molecules/CategoryFilter";
import DateTimePicker from "../molecules/DateTimePicker";
import PromoCodeInputs from "../molecules/PromoCodeInputs";
import TicketInputs from "../molecules/TicketInputs";
import TicketType from "../molecules/TicketType";
import TypeFilter from "../molecules/TypeFilter";
import { Button } from "../ui/button";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
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

export default function UploadEventModal({
  handleClosePopup,
}: closePopupModalType) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [showPromoCodeFormPopup, setShowPromoCodeFormPopup] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

  const [dateAndTime, setDateAndTime] = useState<DateRange | undefined>({
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

  const [currency, setCurrency] = useState("");

  const [singleTicket, setSingleTicket] = useState<number | null>(null);

  const [multipleTickets, setMultipleTickets] = useState<Ticket[]>([]);

  const [selectedAddress, setSelectedAddress] = useState("");

  const [category, setCategory] = useState("");

  const [ticket, setTicket] = useState("");

  const [types, setTypes] = useState<string[]>([]);

  const [notification, setNotification] = useState<string | null>(null);

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchCurrency = async () => {
      const userCurrency = await getUserCurrency();
      setCurrency(userCurrency);
    };

    fetchCurrency();
  }, []);

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

  const handleDateAndTime = (date: DateRange) => {
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
      promoCodes: promoCodes,
      freeEvents: ticket,
      singleTicket: singleTicket,
      multipleTickets: multipleTickets,
      currency,
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
    <div className="w-full h-dvh fixed left-0 top-0 bg-black bg-opacity-50 justify-center items-center z-10 hidden md:flex">
      {/* cancel button */}
      <button
        type="button"
        className="absolute top-5 right-5"
        onClick={() => handleClosePopup(false)}
      >
        <Image
          src="/assets/images/circularCancel.svg"
          alt="Cancel"
          width={40}
          height={40}
          className="filter invert"
        />
      </button>

      {/* Inner popup */}

      <div className="flex flex-col items-center justify-start bg-white w-[45%] h-[75%] rounded-2xl py-3">
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

                <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                  Crop
                </h1>

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
            <div className="flex flex-col items-center gap-5 mt-5 w-[90%]">
              <div>
                <Image
                  src={imagePreview}
                  alt="Selected Avatar"
                  width={300}
                  height={300}
                />
              </div>
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
                  src={imagePreview}
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

                <div className="space-y-4 text-sm font-normal">
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
                    <input
                      type="text"
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

                  <div className="flex justify-between items-center font-semibold text-slate-700">
                    <span>Capacity</span>

                    <input
                      type="number"
                      placeholder="0 if any"
                      {...register("capacity", { valueAsNumber: true })}
                      className="outline-none bg-black bg-opacity-5 w-20 p-2 rounded-md"
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
