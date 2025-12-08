"use client";

import { supabase } from "@/config/supabase/client";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { generateSlug } from "@/utils/geerateSlug";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BiWallet } from "react-icons/bi";
import { GoHome } from "react-icons/go";
import { MdOutlineReceipt } from "react-icons/md";
import { RiSearchLine } from "react-icons/ri";
import { VscAccount } from "react-icons/vsc";
import MobileNavButton from "../atoms/MobileNavButton";
import MobileAuthPopup from "./MobileAuthPopup";

export default function MobileNavBar() {
  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const location = useGetUserLocation();

  const { data: userData } = useQuery({
    queryKey: ["username"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      const response = await supabase
        .from("user_info")
        .select("username")
        .eq("id", user.id)
        .single();

      return response.data?.username;
    },
  });

  const handleAccountClick = (e: React.MouseEvent) => {
    if (!userData) {
      e.preventDefault(); // prevent navigation
      setShowAuthPopup(true); // show modal instead
    }
  };

  return (
    <>
      <div className="flex md:hidden justify-center w-full fixed z-10 bottom-0 border-t border-black-500 py-4 bg-white">
        <div className="flex justify-between w-[90%]">
          <MobileNavButton
            href={`/events/location/${generateSlug(
              location || "default-location",
            )}`}
            text="Home"
            Icon={GoHome}
          />
          <MobileNavButton href="/search" text="Search" Icon={RiSearchLine} />
          <MobileNavButton
            href="/transactions"
            text="Transactions"
            Icon={MdOutlineReceipt}
          />
          <MobileNavButton href="/wallet" text="Wallets" Icon={BiWallet} />
          <MobileNavButton
            href={userData ? `/user/${userData}/posts` : "#"}
            text="Account"
            Icon={VscAccount}
            onClick={handleAccountClick}
          />
        </div>
      </div>

      {showAuthPopup && (
        <MobileAuthPopup
          buttonText="Login"
          onClose={() => setShowAuthPopup(false)}
        />
      )}
    </>
  );
}
