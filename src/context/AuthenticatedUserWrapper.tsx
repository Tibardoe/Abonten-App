"use client";
import { fetchAuthenticatedUser } from "@/services/authService";
import { useEffect } from "react";

export default function AuthenticatedUserWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const run = async () => {
      try {
        await fetchAuthenticatedUser(); // Will call supabase.auth.getUser and ensure user_info exists
      } catch (err) {
        console.error("User not authenticated:", err);
      }
    };
    run();
  }, []);

  return <>{children}</>;
}
