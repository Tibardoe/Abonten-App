"use client";

import { cn } from "@/components/lib/utils";
import { useState } from "react";

export default function ContinueButton() {
  const [disabled, setDisabled] = useState(true);

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "bg-black text-white py-3 rounded-full md:rounded-xl font-bold text-lg w-full md:w-[30%] bottom-0 mx-auto mt-48 md:mt-36",
        { "opacity-70": disabled },
      )}
    >
      Continue
    </button>
  );
}
