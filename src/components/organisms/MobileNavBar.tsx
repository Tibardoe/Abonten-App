"use client";

import { useCurrentUserDetails } from "@/hooks/useCurrentUser";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { generateSlug } from "@/utils/geerateSlug";
import { getSignInUrl } from "@/utils/getSignInUrl";
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

  // Shared with Header/SideBar/etc. — one cached fetch instead of each
  // component independently calling supabase.auth.getUser().
  const { data: userDetails, userLoading: userDataLoading } =
    useCurrentUserDetails();
  const userData = userDetails?.username;

  return (
    <>
      <div className="flex md:hidden justify-center w-full fixed z-10 bottom-0 border-t border-sidebar-border py-4 bg-sidebar">
        <div className="flex justify-between w-[90%]">
          <MobileNavButton
            href={`/explore/${generateSlug(location || "default-location")}`}
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
              userDataLoading
                ? pathname
                : userData
                  ? `/user/${userData}/posts`
                  : getSignInUrl(pathname)
            }
            text={t("account")}
            Icon={VscAccount}
          />
        </div>
      </div>
    </>
  );
}
