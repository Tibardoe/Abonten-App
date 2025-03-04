import Image from "next/image";
import Link from "next/link";

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
          <Image
            className="w-[30px] h-[30px]"
            src="/assets/images/facebook.svg"
            alt="Facebook"
            width={40}
            height={40}
          />
        </Link>

        <Link href="#">
          <Image
            className="w-[20px] h-[20px]"
            src="/assets/images/twitter.svg"
            alt="Twitter"
            width={30}
            height={30}
          />
        </Link>

        <Link href="#">
          <Image
            className="w-[30px] h-[30px]"
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

      <div className="flex gap-2 pl-[5%]">
        <Image
          src="/assets/images/copyright.svg"
          alt="TikTok"
          width={20}
          height={20}
        />
        <p>2025 Abonten App</p>
      </div>
    </div>
  );
}
