"use client";

import { supabase } from "@/config/supabase/client";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { generateSlug } from "@/utils/geerateSlug";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BiWallet } from "react-icons/bi";
import { GoHome } from "react-icons/go";
import { MdOutlineReceipt } from "react-icons/md";
import { RiSearchLine } from "react-icons/ri";
import { VscAccount } from "react-icons/vsc";
import MobileNavButton from "../atoms/MobileNavButton";
import MobileAuthPopup from "./AuthModal";

export default function MobileNavBar() {
  const t = useTranslations("navigation");

  const location = useGetUserLocation();

  const pathname = usePathname();

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

  return (
    <>
      <div className="flex md:hidden justify-center w-full fixed z-10 bottom-0 border-t border-black-500 py-4 bg-white">
        <div className="flex justify-between w-[90%]">
          <MobileNavButton
            href={`/events/location/${generateSlug(
              location || "default-location",
            )}`}
            text={t("home")}
            Icon={GoHome}
          />
          <MobileNavButton
            href="/search"
            text={t("search")}
            Icon={RiSearchLine}
          />
          <MobileNavButton
            href="/transactions"
            text={t("transactions")}
            Icon={MdOutlineReceipt}
          />
          <MobileNavButton href="/wallet" text={t("wallets")} Icon={BiWallet} />

          <MobileNavButton
            href={
              userData
                ? `/user/${userData}/posts`
                : `/auth/signin?next=${encodeURIComponent(pathname)}`
            }
            text={t("account")}
            Icon={VscAccount}
          />
        </div>
      </div>
    </>
  );
}
