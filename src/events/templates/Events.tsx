"use client";

import SideBar from "@/components/organisms/SideBar";
import { useAuth } from "@/context/authContext";
import { useShowMenu } from "@/context/uiContext";
import useUserProfile from "@/hooks/useUserProfile";
import { fetchAuthenticatedUser } from "@/services/authService";
import type { userProfileType } from "@/types/userProfileType";
import React, { useEffect, useState } from "react";

export default function Events() {
  const { user } = useAuth();

  const { isMenuClicked } = useShowMenu();

  const { userProfile } = useUserProfile();

  useEffect(() => {
    const getUser = async () => {
      if (!user) return;

      await fetchAuthenticatedUser();
    };

    getUser();
  }, [user]);

  return (
    <div className="w-[90%] md:w-[80%] mx-auto pt-24 md:pt-32 min-h-[80%]">
      {isMenuClicked && <SideBar />}
      events
    </div>
  );
}
