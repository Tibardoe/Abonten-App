"use client";

import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { supabase } from "@/config/supabase/client";
import { useAuth } from "@/context/authContext";
import useUserProfile from "@/hooks/useUserProfile";
import { fetchAuthenticatedUser } from "@/services/authService";
import type { userProfileType } from "@/types/userProfileType";
import React, { useEffect } from "react";

export default function Events() {
  const { session } = useAuth();

  // console.log(user);

  // const { userProfile } = useUserProfile();

  useEffect(() => {
    const getUser = async () => {
      if (!session) return;

      await fetchAuthenticatedUser();
    };

    getUser();
  }, [session]);

  return (
    <section className="w-[90%] md:w-[80%] mx-auto pt-24 md:pt-32 min-h-[80%]">
      <LocationAndFilterSection />
    </section>
  );
}
