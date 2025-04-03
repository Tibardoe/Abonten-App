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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadButton = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
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
        <div className="w-full">
          <h1 className="text-gray-500 font-bold text-center pb-1 text-lg">
            Upload Avatar
          </h1>
          <hr />
        </div>

        {imagePreview ? (
          <div className="flex flex-col items-center gap-5 my-auto">
            <div>
              <Image
                src={imagePreview}
                alt="Selected Avatar"
                width={200}
                height={200}
              />
            </div>

            <Button className="p-6 text-lg rounded-xl">Upload</Button>
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

            <label htmlFor="fileUpload">
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
                Upload
              </Button>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
