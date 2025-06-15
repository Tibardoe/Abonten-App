"use client";

import { supabase } from "@/config/supabase/client";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { generateSlug } from "@/utils/geerateSlug";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import MobileNavButton from "../atoms/MobileNavButton";
import MobileAuthPopup from "./MobileAuthPopup";

export default function MobileNavBar() {
  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const location = useGetUserLocation();

  const { data: userData } = useQuery({
    queryKey: ["user"],
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
      <div className="flex md:hidden justify-center w-full fixed bottom-0 border-t border-black-500 py-4 bg-white z-20">
        <div className="flex justify-between w-[90%]">
          <MobileNavButton
            href={`/events/${generateSlug(location || "default-location")}`}
            text="Home"
            imgUrl="/assets/images/home.svg"
          />
          <MobileNavButton
            href="/search"
            text="Search"
            imgUrl="/assets/images/search.svg"
          />
          <MobileNavButton
            href="/transactions"
            text="Transactions"
            imgUrl="/assets/images/transactions.svg"
          />
          <MobileNavButton
            href="/wallet"
            text="Wallets"
            imgUrl="/assets/images/wallet.svg"
          />
          <MobileNavButton
            href={userData ? `/user/${userData}/posts` : "#"}
            text="Account"
            imgUrl="/assets/images/account.svg"
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
