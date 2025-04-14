"use client";

import { supabase } from "@/config/supabase/client";
import { useEffect, useState } from "react";
import MobileNavButton from "../atoms/MobileNavButton";

export default function MobileNavBar() {
  const [username, setUsername] = useState(null);

  useEffect(() => {
    const fetchUsername = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

  return (
    <div className="flex md:hidden justify-center w-full fixed bottom-0 border-t border-black-500 py-4 bg-white">
      <div className="flex justify-between w-[90%]">
        <MobileNavButton
          href="/events"
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
          href={`/user/${username}/posts`}
          text="Account"
          imgUrl="/assets/images/account.svg"
        />
      </div>
    </div>
  );
}
