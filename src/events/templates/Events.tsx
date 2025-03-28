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
    <section>
      <LocationAndFilterSection />
    </section>
  );
}
