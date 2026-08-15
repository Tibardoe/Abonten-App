import LandingAuthLinks from "@/landing Page/molecules/LandingAuthLinks";
import LandingLocationSearch from "@/landing Page/organisms/LandingLocationSearch";
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
            <Link href="/" className="w-12 h-12 md:w-16 md:h-16">
              <Image
                src="/assets/images/abonten-logo-white.svg"
                alt="Abonten Logo White"
                width={100}
                height={100}
                className="object-contain"
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
        </div>
      </div>
    </div>
  );
}
