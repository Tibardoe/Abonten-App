"use client";

import { supabase } from "@/config/supabase/client";
import { generateSlug, undoSlug } from "@/utils/geerateSlug";
import { useEffect, useState } from "react";
import MobileNavButton from "../atoms/MobileNavButton";
import MobileAuthPopup from "./MobileAuthPopup";

export default function MobileNavBar() {
  const [username, setUsername] = useState(null);

  const [address, setAddress] = useState<string | null>(null);

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  useEffect(() => {
    const storedAddress = localStorage.getItem("address");

    setAddress(storedAddress);
  }, []);

  useEffect(() => {
    const fetchUsername = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      if (user) {
        const response = await supabase
          .from("user_info")
          .select("username")
          .eq("id", user.id)
          .single();

        setUsername(response.data?.username);
      }
    };

    fetchUsername();
  }, []);

  const handleAccountClick = (e: React.MouseEvent) => {
    if (!username) {
      e.preventDefault(); // prevent navigation
      setShowAuthPopup(true); // show modal instead
    }
  };

  return (
    <>
      <div className="flex md:hidden justify-center w-full fixed bottom-0 border-t border-black-500 py-4 bg-white">
        <div className="flex justify-between w-[90%]">
          <MobileNavButton
            href={`/events/${generateSlug(address || "default-location")}`}
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
            href={username ? `/user/${username}/posts` : "#"}
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
