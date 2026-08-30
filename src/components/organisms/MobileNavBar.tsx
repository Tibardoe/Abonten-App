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
  const {
    user,
    data: userDetails,
    userLoading: userDataLoading,
  } = useCurrentUserDetails();
  const username = userDetails?.username;

  // The account button's target must be driven by whether there's a *session*
  // (`user`), not by whether the profile row (`username`) has loaded yet.
  // Right after sign-in the session exists a beat before the profile fetch
  // resolves; keying off `username` there would send an already-signed-in
  // user to /auth/signin, which then loops (that page doesn't bounce
  // authenticated users). Until the session state is known we stay put; once
  // it's known, a signed-in user always goes somewhere useful -- straight to
  // their profile if we have the username, otherwise to /user-account, which
  // resolves the destination server-side.
  const accountHref = userDataLoading
    ? pathname
    : user
      ? username
        ? `/user/${username}/posts`
        : "/user-account"
      : getSignInUrl(pathname);

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
            href={accountHref}
            text={t("account")}
            Icon={VscAccount}
          />
        </div>
      </div>
    </>
  );
}
