import Link from "next/link";
import React from "react";
import MaskIcon from "../atoms/MaskIcon";

export default function DesktopFooter() {
  return (
    <div className="hidden md:flex w-[80%] mx-auto gap-5 flex-col mb-5">
      {/* Socials */}
      <div className="flex gap-3 items-center">
        <Link href="#">
          <MaskIcon
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/facebook.svg"
            alt="Facebook"
          />
        </Link>

        <Link href="#">
          <MaskIcon
            className="w-[20px] h-[20px] lg:w-[30px] lg:h-[30px]"
            src="/assets/images/twitter.svg"
            alt="Twitter"
          />
        </Link>

        <Link href="#">
          <MaskIcon
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/instagram.svg"
            alt="Instagram"
          />
        </Link>

        <Link href="#">
          <MaskIcon
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/linkedin.svg"
            alt="LinkedIn"
          />
        </Link>

        <Link href="#">
          <MaskIcon
            className="w-[30px] h-[30px] lg:w-[40px] lg:h-[40px]"
            src="/assets/images/tiktok.svg"
            alt="TikTok"
          />
        </Link>
      </div>

      <hr />

      <div className="flex justify-between">
        <div className="flex gap-2">
          <MaskIcon
            src="/assets/images/copyright.svg"
            alt="Copyright"
            className="w-5 h-5"
          />
          <p>{new Date().getFullYear()} Abonten Hub</p>
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
