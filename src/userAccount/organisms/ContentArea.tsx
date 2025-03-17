"use client";

import { useAuth } from "@/context/authContext";
import UserAccountTabsNavigation from "../molecules/UserAccountTabsNavigation";
import Posts from "./Posts";

export default function ContentArea() {
  const { activeTab } = useAuth();

  return (
    <div className="flex flex-col w-full gap-56">
      <UserAccountTabsNavigation />

      {activeTab === "Posts" && <Posts />}
    </div>
  );
}
