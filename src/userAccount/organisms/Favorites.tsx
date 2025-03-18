import Link from "next/link";
import React from "react";

export default function Favorites() {
  return (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">No Favorites added yet</h1>

      <p>Explore and save all your favorite events in one place</p>

      <Link
        href="#"
        className="font-bold md:text-lg text-white bg-black py-1 px-5 rounded-md"
      >
        Explore events
      </Link>
    </div>
  );
}
