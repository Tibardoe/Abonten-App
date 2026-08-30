"use client";

import { useRouter } from "next/navigation";
import MaskIcon from "./MaskIcon";

export default function BackButton() {
  const router = useRouter();

  return (
    <button type="button" onClick={() => router.back()}>
      <MaskIcon
        src="/assets/images/arrowLeft.svg"
        alt="Back"
        className="w-8 h-8 md:w-10 md:h-10"
      />
    </button>
  );
}
