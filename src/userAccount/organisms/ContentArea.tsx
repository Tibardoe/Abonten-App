"use client";

import { useAuth } from "@/context/authContext";
import UserAccountTabsNavigation from "../molecules/UserAccountTabsNavigation";
import Favorites from "./Favorites";
import Posts from "./Posts";
import Reviews from "./Reviews";

export default function ContentArea() {
  const { activeTab } = useAuth();

  return (
    <div className="flex flex-col w-full gap-10 min-h-dvh">
      <UserAccountTabsNavigation />

      {activeTab === "Posts" && <Posts />}
      {activeTab === "Favorites" && <Favorites />}
      {activeTab === "Reviews" && <Reviews />}
    </div>
  );
}
