"use client";

import { getUserDetails } from "@/actions/getUserDetails";
import { getUserEventRole } from "@/actions/getUserEventRole";
import { useAuth } from "@/context/authContext";
import { signOut } from "@/services/authService";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GiPartyFlags } from "react-icons/gi";
import { GoHome } from "react-icons/go";
import { HiOutlineLogin } from "react-icons/hi";
import { IoCreateOutline } from "react-icons/io5";
import { MdOutlineManageHistory } from "react-icons/md";
import { TbLogin } from "react-icons/tb";
import EventUploadMobileButton from "../atoms/EventUploadMobileButton";
import { cn } from "../lib/utils";
import AuthPopup from "./AuthPopup";
import EventUploadMobileModal from "./EventUploadMobileModal";
import MobileAuthPopup from "./MobileAuthPopup";
import MobileFooter from "./MobileFooter";

type menuClickedProp = {
  menuClicked: boolean;
  username: string;
};

export default function SideBar({ menuClicked, username }: menuClickedProp) {
  const { user } = useAuth();

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const [showPostModal, setShowPostModal] = useState(false);

  const [buttonText, setButtonText] = useState("");

  const [userRole, setUserRole] = useState<"organizer" | "attendee" | "none">(
    "none",
  );

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

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;

      try {
        const res = await getUserEventRole(user.id);

        // ✅ Validate the role value before setting state
        if (res.role === "organizer" || res.role === "attendee") {
          setUserRole(res.role);
        } else {
          setUserRole("none");
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
      }
    };

    fetchUserRole();
  }, [user]);

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
            "bg-white w-[80%]",
            menuClicked ? "animate-slideIn" : "animate-slideOut",
          )}
        >
          {user ? (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col gap-3">
              <Link href="/events" className="flex gap-1 items-center">
                <GoHome className="text-2xl" />
                Home
              </Link>

              {userRole === "organizer" && (
                <Link
                  href={`/manage/${username}/attendance`}
                  className="flex gap-1 items-center"
                >
                  <MdOutlineManageHistory className="text-2xl" />
                  Manage Attendance
                </Link>
              )}

              {userRole === "attendee" && (
                <Link
                  href={`/manage/${username}/my-events`}
                  className="bg-transparent rounded-full border-black border p-2"
                >
                  <GiPartyFlags className="text-2xl" />
                  My Events
                </Link>
              )}

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
                <IoCreateOutline className="text-2xl" />
                Post
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="flex gap-1 items-center"
              >
                <HiOutlineLogin className="text-3xl opacity-70" />
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
