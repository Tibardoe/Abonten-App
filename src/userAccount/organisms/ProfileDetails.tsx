"use client";

import UserAvatar from "@/components/atoms/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/authContext";
import type { userProfileDetailsType } from "@/types/userProfileType";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import SettingsButton from "../atoms/SettingsButton";
import Higlight from "../molecules/Highlight";

export default function ProfileDetails({ userData }) {
  const userDetails = userData;

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const defaultAvatar = "AnonymousProfile_rn6qez";

  const avatarUrl = userDetails?.avatarPublicId
    ? `${cloudinaryBaseUrl}v${userDetails.avatarVersion}/${userDetails.avatarPublicId}.jpg`
    : defaultAvatar;

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
              {/* <Image
                className="w-full h-full rounded-full"
                src={avatarUrl}
                // src="/assets/images/AnonymousProfile.jpg"
                alt="User profile picture"
                loading="lazy"
                width={40}
                height={40}
              /> */}

              <UserAvatar avatarUrl={avatarUrl} />
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
          <Link href="/settings/edit-profile">Edit Profile</Link>
        </Button>
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
            <Link href="/settings/edit-profile">Edit Profile</Link>
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
