import Link from "next/link";
import MaskIcon from "../atoms/MaskIcon";

export default function MobileFooter() {
  return (
    <div className="w-full mx-auto space-y-3 flex flex-col justify-start absolute bottom-0 mt-0 mb-20">
      <div className="flex flex-col gap-3 pl-[5%]">
        <Link href="#">Terms & Conditions</Link>

        <Link href="#">Privacy</Link>

        <Link href="#">Cookies</Link>

        <Link href="#">Security</Link>
      </div>

      <hr />

      {/* Socials */}
      <div className="flex gap-3 items-center self-center">
        <Link href="#">
          <MaskIcon
            className="w-[30px] h-[30px]"
            src="/assets/images/facebook.svg"
            alt="Facebook"
          />
        </Link>

        <Link href="#">
          <MaskIcon
            className="w-[20px] h-[20px]"
            src="/assets/images/twitter.svg"
            alt="Twitter"
          />
        </Link>

        <Link href="#">
          <MaskIcon
            className="w-[30px] h-[30px]"
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

      <div className="flex gap-2 pl-[5%]">
        <MaskIcon
          src="/assets/images/copyright.svg"
          alt="Copyright"
          className="w-5 h-5"
        />
        <p>2025 Abonten App</p>
      </div>
    </div>
  );
}
