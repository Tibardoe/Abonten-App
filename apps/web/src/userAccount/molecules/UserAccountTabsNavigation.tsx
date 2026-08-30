"use client";

import { usePathname } from "next/navigation";
import UserAccountTabsNavButton from "../atoms/UserAccountTabsNavButton";

type UsernameProp = {
  ownUsername: string;
};

export default function UserAccountTabsNavigation({
  ownUsername,
}: UsernameProp) {
  const pathname = usePathname(); // e.g. /Tibardoe/posts

  // Extract the username from the pathname
  const parts = pathname.split("/"); // ["", "Tibardoe", "posts"]
  const username = parts[2]; // "Tibardoe"

  const isCurrentUser = username === ownUsername;

  return (
    <div className="w-full flex justify-center items-center border-t border-border">
      {/* No horizontal scroll: full-width even spacing on mobile (at most 4
          tabs since Bookings moved into the profile's Manage menu), fixed
          gap centered row from sm: up, matching UserAccountTabsNavButton's
          own mobile/desktop sizing split. */}
      <div className="flex w-full justify-between px-1 sm:w-auto sm:justify-center sm:gap-5 sm:px-0">
        <UserAccountTabsNavButton
          imgUrl="/assets/images/posts.svg"
          text="Events"
          path="posts"
          username={username}
        />

        <UserAccountTabsNavButton
          imgUrl="/assets/images/location.svg"
          text="Places"
          username={username}
        />

        {isCurrentUser && (
          <UserAccountTabsNavButton
            imgUrl="/assets/images/favorites.svg"
            text="Favorites"
            username={username}
          />
        )}

        <UserAccountTabsNavButton
          imgUrl="/assets/images/reviews.svg"
          text="Reviews"
          username={username}
        />
      </div>
    </div>
  );
}
