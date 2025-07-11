import { saveAvatarToCloudinary } from "@/actions/saveAvatarToCloudinary";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IoIosArrowRoundBack } from "react-icons/io";
import { MdOutlineCancel } from "react-icons/md";
import Notification from "../atoms/Notification";
import { Button } from "../ui/button";
import ImageCropper from "./ImageCropper";

type closePopupModalType = {
  handleClosePopup: (state: boolean) => void;
};

export default function UploadAvatarModal({
  handleClosePopup,
}: closePopupModalType) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [cropped, setCropped] = useState<File | null>(null);

  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  const [step, setStep] = useState(1);

  const router = useRouter();

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

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!cropped || !selectedFile) {
        setNotification("Please select a photo!");
        return;
      }

      if (cropped.size > 5 * 1024 * 1024) {
        setNotification("File is too large. Please upload an image under 5MB.");
        return;
      }

      try {
        await saveAvatarToCloudinary(cropped);
        setNotification("Upload successful!");
        handleClosePopup(false);
        router.refresh();
        return "success";
      } catch (error) {
        console.error("Error uploading image:", error);
        setNotification("Upload failed. Please try again.");
      }
    },
    onSettled: () => {
      setTimeout(() => {
        setNotification(null);
      }, 3000);
    },
  });

  // Cleanup imagePreview URL when it changes or on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Cleanup croppedPreview URL when it changes or on unmount
  useEffect(() => {
    return () => {
      if (croppedPreview) URL.revokeObjectURL(croppedPreview);
    };
  }, [croppedPreview]);

  const handleCropped = (croppedFile: File) => {
    setCropped(croppedFile);
    const preview = URL.createObjectURL(croppedFile);
    setCroppedPreview(preview);
    setStep(3);
  };

  return (
    <>
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

        <div className="flex flex-col items-center justify-start bg-white w-[45%] h-[85%] rounded-2xl py-3">
          <div className="w-full">
            {step === 1 && (
              <div>
                <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                  Upload Avatar
                </h1>
              </div>
            )}

            {step === 2 && (
              <div className="flex items-center w-[95%] mx-auto">
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => setStep((prevStep) => prevStep - 1)}
                  >
                    <IoIosArrowRoundBack className="text-4xl" />
                  </button>
                )}

                <h1 className="text-gray-500 font-bold ml-auto pb-1 text-lg">
                  Crop
                </h1>
              </div>
            )}

            {step === 3 && (
              <div className="flex justify-between w-[95%] mx-auto">
                {step === 3 && (
                  <button
                    type="button"
                    onClick={() => setStep((prevStep) => prevStep - 1)}
                  >
                    <IoIosArrowRoundBack className="text-4xl" />
                  </button>
                )}

                <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
                  Upload Avatar
                </h1>

                {step === 3 && (
                  <button
                    type="button"
                    className="font-bold"
                    onClick={() => mutate()}
                    disabled={isPending}
                  >
                    {isPending ? "Uploading..." : "Upload"}
                  </button>
                )}
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

          {step === 2 && imagePreview && (
            <ImageCropper
              imagePreview={imagePreview}
              handleCropped={handleCropped}
              handleCancel={() => {
                setImagePreview(null);
                setSelectedFile(null);
                setStep((prevStep) => prevStep - 1);
              }}
            />
          )}

          {step === 3 && croppedPreview && (
            <div className="flex flex-col items-center gap-5 mt-5 w-[90%]">
              <div>
                <Image
                  src={croppedPreview}
                  alt="Selected Avatar"
                  width={300}
                  height={300}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {notification && <Notification notification={notification} />}
    </>
  );
}
