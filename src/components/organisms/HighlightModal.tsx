import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "../ui/button";

type closePopupModalType = {
  handleShowHighlightModal: (state: boolean) => void;
};

export default function HighlightModal({
  handleShowHighlightModal,
}: closePopupModalType) {
  const [highlightsPreview, setHighlightsPreview] = useState<string[] | null>(
    null,
  );

  const [selectedFiles, setSelectedFiles] = useState<File[] | null>(null);

  const [isUploading, setIsUploading] = useState(false);

  const [step, setStep] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadButton = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    if (files && files.length > 0) {
      const selected = Array.from(files);
      const previews = selected.map((file) => URL.createObjectURL(file));
      setHighlightsPreview(previews);
      setSelectedFiles(selected);
      setStep((prevStep) => prevStep + 1);
    }
  };

  const handleUpload = async () => {
    if (!selectedFiles) {
      alert("Please select a file first!");
      return;
    }

    setIsUploading(true);

    // try {
    //   await saveAvatarToCloudinary(selectedFiles);
    //   alert("Upload successful!");
    //   handleShowHighlightModal(false);
    // } catch (error) {
    //   console.error("Error uploading image:", error);
    //   alert("Upload failed. Please try again.");
    // } finally {
    //   setIsUploading(false);
    // }
  };

  return (
    <div className="w-full h-dvh fixed left-0 top-0 bg-black bg-opacity-50 justify-center items-center z-10 flex">
      {/* cancel button */}
      <button
        type="button"
        className="absolute top-5 right-5 hidden md:flex"
        onClick={() => handleShowHighlightModal(false)}
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

      <div className="flex flex-col items-center justify-start bg-white w-full h-[95%] mt-auto md:mt-0 md:w-[60%] lg:w-[45%] md:h-[75%] rounded-t-2xl md:rounded-2xl py-3">
        <div className="w-full">
          {step === 1 && (
            <div className="flex justify-end items-center px-4 md:px-0">
              <h1 className="text-gray-500 font-bold text-center pb-1 text-lg mx-auto">
                New Higlight
              </h1>

              <button
                type="button"
                className="md:hidden"
                onClick={() => handleShowHighlightModal(false)}
              >
                <Image
                  src="/assets/images/circularCancel.svg"
                  alt="Cancel"
                  width={25}
                  height={25}
                />
              </button>
            </div>
          )}

          {step === 2 && (
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
                Upload Highlight
              </h1>

              <button
                type="button"
                className="font-bold"
                onClick={() => setStep((prevStep) => prevStep + 1)}
              >
                Next
              </button>
            </div>
          )}

          {step === 3 && (
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
                Upload Highlight
              </h1>

              <button
                type="button"
                className="font-bold"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          )}

          <hr />
        </div>

        {step === 1 && (
          <div className="flex flex-col items-center gap-5 my-auto">
            <div className="flex flex-col items-center">
              <Image
                src="/assets/images/gallery.svg"
                alt="Gallery"
                width={100}
                height={100}
              />
              <p className="text-lg">Upload highlights here</p>
            </div>

            <input
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              ref={fileInputRef}
              onChange={handleFileChange}
            />

            <Button
              className="p-6 text-lg rounded-xl"
              onClick={handleUploadButton}
            >
              Upload
            </Button>
          </div>
        )}

        {step === 2 && highlightsPreview && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1 mt-5 w-[90%] overflow-auto max-h-[90%]">
            {highlightsPreview.map((preview, index) => {
              const file = selectedFiles?.[index];
              const isVideo = file?.type.startsWith("video");

              return isVideo ? (
                <video
                  key={preview}
                  src={preview}
                  controls
                  className="h-64 object-cover"
                >
                  <track
                    kind="captions"
                    srcLang="en"
                    label="English"
                    //   src="/path-to-your-captions.vtt"
                    default
                  />
                </video>
              ) : (
                <Image
                  key={preview}
                  src={preview}
                  alt={`Preview ${index}`}
                  width={300}
                  height={300}
                  className="h-64"
                />
              );
            })}
          </div>
        )}

        {step === 3 && highlightsPreview && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1 mt-5 w-[90%] overflow-auto max-h-[90%]">
            {highlightsPreview.map((preview, index) => {
              const file = selectedFiles?.[index];
              const isVideo = file?.type.startsWith("video");

              return isVideo ? (
                <video
                  key={preview}
                  src={preview}
                  controls
                  className="h-64 object-cover"
                >
                  <track
                    kind="captions"
                    srcLang="en"
                    label="English"
                    //   src="/path-to-your-captions.vtt"
                    default
                  />
                </video>
              ) : (
                <Image
                  key={preview}
                  src={preview}
                  alt={`Preview ${index}`}
                  width={300}
                  height={300}
                  className="h-64"
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
