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

  const { loading, user } = useAuth();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (!loading && !user) {
          router.push("/");
          return;
        }

        const res = await fetch("/api/user-profile");

        const result = await res.json();

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
  }, [loading, user, router]);

  return (
    <>
      {/* On mobile */}
      <div className="md:hidden flex flex-col gap-10">
        <div className="flex w-full justify-between">
          <h2 className="font-bold">{userDetails?.username}</h2>

          <SettingsButton />
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-10">
            <div className="w-[100px] h-[100px] rounded-full">
              <Image
                className="w-full h-full rounded-full"
                src={
                  userDetails?.avatarPublicId && userDetails.avatarVersion
                    ? "tyh"
                    : "/assets/images/AnonymousProfile.jpg"
                }
                // src="/assets/images/AnonymousProfile.jpg"
                alt="User profile picture"
                loading="lazy"
                width={40}
                height={40}
              />
            </div>
            <div className="grid grid-cols-3 gap-5 justify-start items-center">
              <h2 className="col-span-3">{userDetails?.username}</h2>

              <span>
                <h2>
                  <span className="font-bold">{0}</span> Posts
                </h2>
              </span>

              <span>
                <h2>
                  <span className="font-bold">{0}</span> Favorites
                </h2>
              </span>

              <span>
                <h2>
                  <span className="font-bold">{userDetails?.rating || 0}</span>{" "}
                  Ratings
                </h2>
              </span>
            </div>
          </div>

          <div className="w-full">
            <p>It is working</p>
          </div>
        </div>

        <Button variant="outline" className="border-black border-2 font-bold">
          <Link href="/user-profile">Edit Profile</Link>
        </Button>

        <div className="space-y-3">
          <h2 className="font-semibold">Highlights</h2>

          <button type="button">
            <Image
              src="/assets/images/highlight.svg"
              alt="Highlight button"
              width={80}
              height={80}
            />
          </button>
        </div>
      </div>

      {/* On tablet and desktop */}
      <div className="hidden md:flex gap-20 items-start">
        <div className="w-[100px] h-[100px] md:w-[150px] md:h-[150px] lg:w-[180px] lg:h-[180px] rounded-full">
          <Image
            className="w-full h-full rounded-full"
            src={
              userDetails?.avatarPublicId && userDetails.avatarVersion
                ? "tyh"
                : "/assets/images/AnonymousProfile.jpg"
            }
            // src="/assets/images/AnonymousProfile.jpg"
            alt="User profile picture"
            loading="lazy"
            width={40}
            height={40}
          />
        </div>
        <div className="grid grid-cols-3 gap-5 justify-start items-center">
          <h2>{userDetails?.username}</h2>

          <Button variant="outline" className="border-black font-bold">
            <Link href="/user-profile">Edit Profile</Link>
          </Button>

          <SettingsButton />

          <span>
            <h2>
              <span className="font-bold">{0}</span> Posts
            </h2>
          </span>

          <span>
            <h2>
              <span className="font-bold">{0}</span> Favorites
            </h2>
          </span>

          <span>
            <h2>
              <span className="font-bold">{userDetails?.rating || 0}</span>{" "}
              Ratings
            </h2>
          </span>

          <div>
            <p>It is working</p>
          </div>
        </div>
      </div>
    </>
  );
}
