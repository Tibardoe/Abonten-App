"use client";

import Image from "next/image";
import Link from "next/link";

export default function BackButton() {
  return (
    <Link href="#" onClick={() => window.history.back()}>
      <Image
        src="/assets/images/arrowLeft.svg"
        alt="Back"
        width={40}
        height={40}
      />
    </Link>
  );
}
