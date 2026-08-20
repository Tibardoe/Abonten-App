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
    <div className="w-full flex justify-center items-center flex-col border-t border-border">
      <div className="flex gap-5">
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
