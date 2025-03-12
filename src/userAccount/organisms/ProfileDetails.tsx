"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/authContext";
import type { userProfileDetailsType } from "@/types/userProfileType";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SettingsButton from "../atoms/SettingsButton";

export default function ProfileDetails() {
  const [userDetails, setUserDetails] = useState<userProfileDetailsType | null>(
    null,
  );

  const router = useRouter();

  const { user, session } = useAuth();

  useEffect(() => {
    const fetchUser = async () => {
      if (!session) {
        router.push("/");
        return;
      }
      try {
        const res = await fetch("/api/user-profile", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });

        const result = await res.json();

        console.log("results=", result);

        if (res.ok) {
          setUserDetails(result.data);
        } else {
          console.error("Error:", result.error);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    fetchUser();
  }, [session, router]);

  console.log("user details=", userDetails);

  return (
    <>
      {/* On mobile */}
      <div className="md:hidden">
        <h1>cc</h1> <SettingsButton />
      </div>

      {/* On tablet and desktop */}
      <div className="hidden md:flex gap-20">
        <div className="w-[100px] h-[100px] md:w-[150px] md:h-[150px] lg:w-[180px] lg:h-[180px] rounded-full">
          <Image
            className="w-full h-full rounded-full"
            src="/assets/images/AnonymousProfile.jpg"
            alt="User profile picture"
            loading="lazy"
            width={40}
            height={40}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 place-items-center">
          <h1>cc</h1>

          <Button variant="outline" className="border-black font-bold">
            <Link href="/user-profile">Edit Profile</Link>
          </Button>

          <SettingsButton />

          <span>
            <h2>{}</h2>
          </span>
        </div>
      </div>
    </>
  );
}
