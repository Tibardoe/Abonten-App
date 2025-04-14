"use client";

import { useAuth } from "@/context/authContext";
import { signOut } from "@/services/authService";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import EventUploadMobileButton from "../atoms/EventUploadMobileButton";
import { cn } from "../lib/utils";
import AuthPopup from "./AuthPopup";
import EventUploadMobileModal from "./EventUploadMobileModal";
import MobileAuthPopup from "./MobileAuthPopup";
import MobileFooter from "./MobileFooter";

type menuClickedProp = {
  menuClicked: boolean;
};

export default function SideBar({ menuClicked }: menuClickedProp) {
  const { user } = useAuth();

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const [showPostModal, setShowPostModal] = useState(false);

  const [buttonText, setButtonText] = useState("");

  const router = useRouter();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const text = (event.target as HTMLButtonElement).innerText;
    setButtonText(text);

    setShowAuthPopup((prevState) => !prevState);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Upload features
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const closePopup = (state: boolean) => {
    setShowPostModal(state);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setSelectedFile(file);
      setShowPostModal(true);
    }
  };

  return showAuthPopup ? (
    <>
      <AuthPopup
        buttonText={buttonText}
        onClose={() => setShowAuthPopup(false)}
      />
      <MobileAuthPopup
        buttonText={buttonText}
        onClose={() => setShowAuthPopup(false)}
      />
    </>
  ) : (
    <>
      {showPostModal && (
        <EventUploadMobileModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
        />
      )}

      <div className="bg-black bg-opacity-50 w-full flex lg:hidden fixed left-0 top-[71px] h-[100%]">
        <div
          className={cn(
            "bg-white z-20 w-[80%]",
            menuClicked ? "animate-slideIn" : "animate-slideOut",
          )}
        >
          {user ? (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col gap-3">
              <Link href="/events" className="flex gap-1 items-center">
                <Image
                  src="/assets/images/home.svg"
                  alt="Post"
                  width={30}
                  height={30}
                />
                Home
              </Link>

              <input
                type="file"
                accept="image/*, video/*"
                hidden
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <button
                type="button"
                className="flex gap-1 items-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <Image
                  src="/assets/images/post.svg"
                  alt="Post"
                  width={30}
                  height={30}
                />
                Post
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="flex gap-1 items-center"
              >
                <Image
                  src="/assets/images/signout.svg"
                  alt="Post"
                  width={30}
                  height={30}
                />
                SignOut
              </button>
            </div>
          ) : (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col items-start gap-3 text-lg font-bold">
              <button type="button" onClick={handleClick}>
                Login
              </button>

              <button type="button" onClick={handleClick}>
                Sign up
              </button>
            </div>
          )}

          <MobileFooter />
        </div>
      </div>
    </>
  );
}
