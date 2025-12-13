"use client";

import { getUserEventRole } from "@/actions/getUserEventRole";
import { supabase } from "@/config/supabase/client";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { signOut } from "@/services/authService";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { GiPartyFlags } from "react-icons/gi";
import { GoHome } from "react-icons/go";
import { HiOutlineLogin } from "react-icons/hi";
import { IoCreateOutline } from "react-icons/io5";
import { MdOutlineManageHistory } from "react-icons/md";
import { cn } from "../lib/utils";
import EventUploadMobileModal from "./EventUploadMobileModal";
import MobileFooter from "./MobileFooter";

type menuClickedProp = {
  menuClicked: boolean;
};

export default function SideBar({ menuClicked }: menuClickedProp) {
  const [showPostModal, setShowPostModal] = useState(false);

  const location = useGetUserLocation();

  const router = useRouter();

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

  const { data: userRole } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      try {
        const res = await getUserEventRole(user.id);

        // ✅ Validate the role value before setting state
        if (Array.isArray(res.role)) {
          return res.role;
        }

        return null;
      } catch (error) {
        console.error("Error fetching user role:", error);
      }
    },
  });

  const { data: user } = useQuery({
    queryKey: ["sidebar-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      return user;
    },
  });

  return (
    <>
      {showPostModal && (
        <EventUploadMobileModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
        />
      )}

      <div className="bg-black bg-opacity-50 w-full flex lg:hidden fixed z-20 left-0 top-[71px] h-[100%]">
        <div
          className={cn(
            "bg-white w-[80%]",
            menuClicked ? "animate-slideIn" : "animate-slideOut",
          )}
        >
          {user ? (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col gap-5">
              <Link
                href={`/events/location/${location}`}
                className="flex gap-1 items-center"
              >
                <GoHome className="text-xl" />
                Home
              </Link>

              <button
                type="button"
                className="flex gap-1 items-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <IoCreateOutline className="text-xl" />
                Post
              </button>

              {userRole?.includes("organizer") && (
                <Link
                  href="/manage/attendance/event-list"
                  className="flex gap-1 items-center"
                >
                  <MdOutlineManageHistory className="text-xl" />
                  Manage Attendance
                </Link>
              )}

              {userRole?.includes("attendee") && (
                <Link
                  href="/manage/my-events"
                  className="flex gap-1 items-center"
                >
                  <GiPartyFlags className="text-xl" />
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
                onClick={handleSignOut}
                className="flex gap-1 items-center"
              >
                <HiOutlineLogin className="text-2xl opacity-70" />
                Sign Out
              </button>
            </div>
          ) : (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col items-start gap-2 font-bold">
              <Link href="/auth/signin">Login</Link>

              <Link href="/auth/signin">Sign up</Link>
            </div>
          )}

          <MobileFooter />
        </div>
      </div>
    </>
  );
}
