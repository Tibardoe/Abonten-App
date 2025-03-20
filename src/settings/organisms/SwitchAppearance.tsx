"use client";

import { cn } from "@/components/lib/utils";
import Image from "next/image";
import { useState } from "react";

export default function SwitchAppearance() {
  const [toggle, setToggle] = useState(false);

  const handleToggle = () => {
    setToggle((prevstate) => !prevstate);
  };

  return (
    <div className="flex justify-between items-start w-full">
      <div className="flex gap-5 items-center">
        <p className="text-xl">Dark mode</p>
        <Image
          src={
            toggle
              ? "/assets/images/lightMode.svg"
              : "/assets/images/darkMode.svg"
          }
          alt={"Dark mode icon"}
          width={30}
          height={30}
        />
      </div>

      <button
        type="button"
        className="w-14 h-6 relative bg-black bg-opacity-45 rounded-full grid justify-items-start items-center p-1"
        onClick={handleToggle}
      >
        <span
          className={cn(
            "w-5 h-5 rounded-full absolute bg-white transition-all duration-200 ease-in-out transform",
            toggle ? "translate-x-9" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
