import { cn } from "@/components/lib/utils";
import Image from "next/image";
import { useState } from "react";

export default function SwitchAppearance() {
  const [toggle, setToggle] = useState(false);

  const handleToggle = () => {
    setToggle((prevstate) => !prevstate);
  };

  return (
    <div>
      <div>
        <p>Dark mode</p>
        <Image
          src={"/assets/images/darkMode.svg"}
          alt={"Dark mode icon"}
          width={40}
          height={40}
        />
      </div>

      <button
        type="button"
        className="w-14 h-6 relative bg-black bg-opacity-45 rounded-full grid justify-items-start items-center p-1"
        onClick={handleToggle}
      >
        <span
          className={cn(
            "w-5 h-5 rounded-full bg-white transition-all duration-200 ease-in-out transform",
            toggle ? "-translate-x-0" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
