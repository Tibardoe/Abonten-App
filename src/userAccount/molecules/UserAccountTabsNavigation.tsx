"use client";

import { useAuth } from "@/context/authContext";
import { useState } from "react";
import UserAccountTabsNavButton from "../atoms/UserAccountTabsNavButton";

export default function UserAccountTabsNavigation() {
  const { activeTab, setActiveTab } = useAuth();

  if (!activeTab) return null;

  const handleClick = (text: string) => {
    setActiveTab(text);
  };

  const tabs = [
    { imgUrl: "/assets/images/posts.svg", text: "Posts" },
    { imgUrl: "/assets/images/favorites.svg", text: "Favorites" },
    { imgUrl: "/assets/images/reviews.svg", text: "Reviews" },
  ];

  return (
    <div className="w-full flex justify-center items-center flex-col border-t border-black-500">
      <div className="flex gap-5">
        <UserAccountTabsNavButton
          imgUrl="/assets/images/posts.svg"
          text="Posts"
          isActive={activeTab === "Posts"}
          onClick={() => handleClick("Posts")}
        />

        <UserAccountTabsNavButton
          imgUrl="/assets/images/favorites.svg"
          text="Favorites"
          isActive={activeTab === "Favorites"}
          onClick={() => handleClick("Favorites")}
        />

        <UserAccountTabsNavButton
          imgUrl="/assets/images/reviews.svg"
          text="Reviews"
          isActive={activeTab === "Reviews"}
          onClick={() => handleClick("Reviews")}
        />
      </div>
    </div>
  );
}
