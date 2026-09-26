import LandingAuthLinks from "@/landingPage/molecules/LandingAuthLinks";
import LandingLocationSearch from "@/landingPage/organisms/LandingLocationSearch";
import { SIGN_OFF_CREDIT } from "@abonten/core/brand/signOff";
import Image from "next/image";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function Home() {
  return (
    <div className="fixed w-full">
      <div className="bg-landing bg-repeat bg-cover bg-bottom w-full h-dvh relative text-white flex flex-col items-center">
        {/* Header */}
        <nav className="fixed w-full bg-black bg-opacity-30 flex justify-center z-10">
          <div className="flex justify-between items-center py-5 w-[90%]">
            <Link href="/" aria-label="Abonten home">
              {/* The ABƆNTEN logotype: the landing page is the one place
                  with room for the full word at a readable size. */}
              <Image
                src="/assets/images/brand/abonten-logotype-night.svg"
                alt="Abonten"
                width={213}
                height={40}
                priority
                className="h-8 w-auto md:h-10"
              />
            </Link>

            <LandingAuthLinks />
          </div>
        </nav>

        {/* overlay */}
        <div className="absolute flex justify-center items-center w-full h-dvh bg-black bg-opacity-30">
          {/* Hero */}
          <div className="w-[90%] space-y-12">
            <h1 className="font-bold text-4xl text-center lg:text-6xl lg:text-left">
              Connecting people to <br /> experiences
            </h1>

            <LandingLocationSearch />
          </div>

          {/* The brand's sign-off: one credit line on the homepage, never on
              money, tickets, support, legal pages or errors. */}
          <p className="absolute bottom-6 inset-x-0 px-4 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 text-balance md:text-[11px] md:tracking-[0.18em]">
            {SIGN_OFF_CREDIT}
          </p>
        </div>
      </div>
    </div>
  );
}
