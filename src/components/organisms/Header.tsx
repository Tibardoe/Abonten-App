import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <nav className="w-full text flex justify-center ">
      <div className="flex justify-between py-5 w-[90%] md:w-[80%] border-b border-black-500 items-center">
        <div className="mx-auto lg:mx-0 flex items-center w-full">
          {/* Menu button on small devices */}
          <button
            type="button"
            className="lg:hidden w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
          >
            <Image
              src="/assets/images/menu.svg"
              alt="Menu icon"
              width={40}
              height={40}
            />
          </button>

          <Link
            href="/"
            className="absolute left-1/2 transform -translate-x-1/2 lg:static lg:translate-x-0"
          >
            <h1 className="text-2xl md:text-4xl font-bold">Abonten</h1>
          </Link>
        </div>

        <div className="space-x-5 hidden lg:flex">
          <Button
            variant="outline"
            className="bg-transparent rounded-full font-bold border-black"
          >
            Sign Up
          </Button>
          <Button
            variant="outline"
            className="bg-transparent rounded-full font-bold border-black"
          >
            Sign In
          </Button>
        </div>
      </div>
    </nav>
  );
}
