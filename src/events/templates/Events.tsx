"use client";

import Banner from "@/components/molecules/Banner";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { supabase } from "@/config/supabase/client";
import { useAuth } from "@/context/authContext";
import useUserProfile from "@/hooks/useUserProfile";
import { fetchAuthenticatedUser } from "@/services/authService";
import type { userProfileType } from "@/types/userProfileType";
import React, { useEffect } from "react";

export default function Events() {
  const { session } = useAuth();

  useEffect(() => {
    const getUser = async () => {
      if (!session) return;

      await fetchAuthenticatedUser();
    };

    getUser();
  }, [session]);

  return (
    <section className="space-y-10">
      <LocationAndFilterSection />

      <Banner />
    </section>
  );
}
