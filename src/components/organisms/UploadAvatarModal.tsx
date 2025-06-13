import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "../ui/button";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
};

export default function UploadAvatarModal({
  handleClosePopup,
}: closePopupModalType) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

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

  return (
    <div className="w-full h-dvh fixed left-0 top-0 bg-black bg-opacity-50 justify-center items-center z-30 hidden md:flex">
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
        <div className="w-full">
          {step === 1 && (
            <div>
              <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                Upload Avatar
              </h1>
            </div>
          )}

          {step === 2 && (
            <div className="flex justify-between w-[90%] mx-auto">
              {step === 2 && (
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
              )}

              <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                Upload Avatar
              </h1>

              {step === 2 && (
                <button
                  type="button"
                  className="font-bold"
                  onClick={handleUpload}
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading..." : "Upload"}
                </button>
              )}
            </div>
          )}

          <hr />
        </div>

        {step === 2 && imagePreview ? (
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
        ) : (
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
              Upload avatar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
