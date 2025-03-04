import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function DesktopFooter() {
  return (
    <div className="hidden md:flex w-[80%] mx-auto gap-5 flex-col mb-5">
      {/* Socials */}
      <div className="flex gap-3 items-center">
        <Link href="#">
          <Image
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/facebook.svg"
            alt="Facebook"
            width={40}
            height={40}
          />
        </Link>

        <Link href="#">
          <Image
            className="w-[20px] h-[20px] lg:w-[30px] lg:h-[30px]"
            src="/assets/images/twitter.svg"
            alt="Twitter"
            width={30}
            height={30}
          />
        </Link>

        <Link href="#">
          <Image
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/instagram.svg"
            alt="Instagram"
            width={40}
            height={40}
          />
        </Link>

        <Link href="#">
          <Image
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/linkedin.svg"
            alt="LinkedIn"
            width={40}
            height={40}
          />
        </Link>

        <Link href="#">
          <Image
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/tiktok.svg"
            alt="TikTok"
            width={40}
            height={40}
          />
        </Link>
      </div>

      <hr />

      <div className="flex justify-between">
        <div className="flex gap-2">
          <Image
            src="/assets/images/copyright.svg"
            alt="TikTok"
            width={20}
            height={20}
          />
          <p>2025 Abonten App</p>
        </div>

        <div className="space-x-5">
          <Link href="#">Terms & Conditions</Link>

          <Link href="#">Privacy</Link>

          <Link href="#">Cookies</Link>

          <Link href="#">Security</Link>
        </div>
      </div>
    </div>
  );
}
