"use client";

import Link from "next/link";
import MaskIcon from "./MaskIcon";

export default function BackButton() {
  return (
    <Link href="#" onClick={() => window.history.back()}>
      <MaskIcon
        src="/assets/images/arrowLeft.svg"
        alt="Back"
        className="w-8 h-8 md:w-10 md:h-10"
      />
    </Link>
  );
}
