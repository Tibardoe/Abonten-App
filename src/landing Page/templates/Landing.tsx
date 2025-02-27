import AutoComplete from "@/components/molecules/AutoComplete";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="bg-landing bg-repeat bg-cover bg-bottom w-full h-screen relative text-white flex flex-col items-center">
      {/* Header */}
      <nav className="w-full bg-black bg-opacity-30 flex justify-center">
        <div className="flex justify-between py-5 w-[90%] md:w-[80%]">
          <div>
            <Link href="/">
              <h1 className="text-2xl md:text-4xl font-bold">Abonten</h1>
            </Link>
          </div>
          <div className="space-x-5">
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold"
            >
              Sign Up
            </Button>
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold"
            >
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      {/* overlay */}
      <div className="absolute flex justify-center items-center w-full h-screen bg-black bg-opacity-30">
        {/* Hero */}
        <div className="w-[90%] md:w-[80%] space-y-12">
          <h1 className="font-bold text-4xl text-center md:text-5xl lg:text-6xl lg:text-left">
            Explore, post and attend <br /> events near you
          </h1>
          <div className="flex gap-2 items-center justify-center lg:justify-start">
            <AutoComplete />
            <Link href="/events">
              <Image
                className="w-[50px] h-[50px] md:w-[70px] md:h-[70px]"
                src="/assets/images/go.svg"
                alt="Next image"
                width={50}
                height={50}
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
