import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import Image from "next/image";
import { useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import PostAutoComplete from "../atoms/PostAutoComplete";
import PostInput from "../atoms/PostInput";
import AutoComplete from "../molecules/AutoComplete";
import CategoryFilter from "../molecules/CategoryFilter";
import DateTimePicker from "../molecules/DateTimePicker";
import TypeFilter from "../molecules/TypeFilter";
import { Button } from "../ui/button";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
};

export default function UploadEventModal({
  handleClosePopup,
}: closePopupModalType) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

  const [dateAndTime, setDateAndTime] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  const [selectedAddress, setSelectedAddress] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const [category, setCategory] = useState("");

  const [types, setTypes] = useState<string[]>([]);

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
                  onClick={() => setStep((prevStep) => prevStep + 1)}
                  disabled={isUploading}
                >
                  Share
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

              <div className="space-y-4 w-1/2 overflow-y-scroll py-5 overflow-x-hidden font-normal">
                {/* <PostInput inputPlaceholder="Title" /> */}

                <div className="space-y-2">
                  <div className="w-full">
                    <input
                      type="text"
                      placeholder="Title"
                      className="bg-transparent outline-none text-md w-full"
                    />
                  </div>

                  <hr />
                </div>

                {/* <PostInput inputPlaceholder="Description" /> */}

                <div className="space-y-2">
                  <div className="w-full">
                    <textarea
                      rows={5}
                      placeholder="Description"
                      className="bg-transparent outline-none text-md w-full"
                    />
                  </div>

                  <hr />
                </div>

                <PostAutoComplete
                  address={{ address: setSelectedAddress }}
                  placeholderText={{
                    text: "Location",
                    svgUrl: "assets/images/location.svg",
                  }}
                />

                <DateTimePicker handleDateAndTime={handleDateAndTime} />

                <div className="space-y-4 text-sm font-normal">
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
                  />

                  <TypeFilter
                    selectedTypes={types}
                    selectedCategory={category}
                    handleType={handleType}
                  />

                  <div className="flex justify-between items-center">
                    <input type="text" placeholder="Website" />

                    <Image
                      src="/assets/images/website.svg"
                      alt="Website"
                      width={25}
                      height={25}
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
    </div>
  );
}
