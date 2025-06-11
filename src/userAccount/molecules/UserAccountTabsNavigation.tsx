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

  // const tabs = [
  //   { imgUrl: "/assets/images/posts.svg", text: "Posts" },
  //   { imgUrl: "/assets/images/favorites.svg", text: "Favorites" },
  //   { imgUrl: "/assets/images/reviews.svg", text: "Reviews" },
  // ];

  return (
    <div className="w-full flex justify-center items-center flex-col border-t border-black-500">
      <div className="flex gap-5">
        <UserAccountTabsNavButton
          imgUrl="/assets/images/posts.svg"
          text="Posts"
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
