"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/authContext";
import { signOut } from "@/services/authService";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import AuthPopup from "./AuthPopup";
import MobileAuthPopup from "./MobileAuthPopup";
import SideBar from "./SideBar";

export default function Header() {
  const [buttonText, setButtonText] = useState("");

  const [profilePicture, setProfilePicture] = useState("");

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const [isMenuClicked, setIsMenuClicked] = useState(false);

  const pathname = usePathname();

  const { user, session } = useAuth();

  const router = useRouter();

  useEffect(() => {
    const fetchProfilePicture = async () => {
      if (!user) {
        return;
      }

      const res = await fetch("/api/user-profile", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      const result = await res.json();

      if (res.ok && result.url) {
        setProfilePicture(result.url);
      }
    };

    fetchProfilePicture();
  }, [user, session]);

  const isUserAccount = pathname === "/user-account";

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const text = (event.target as HTMLButtonElement).innerText;
    setButtonText(text);

    setShowAuthPopup((prevState) => !prevState);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleMenuClicked = () => {
    setIsMenuClicked((prevState) => !prevState);
  };

  return (
    <nav className="w-full text flex justify-center fixed bg-white z-10">
      {showAuthPopup && (
        <>
          <AuthPopup
            buttonText={buttonText}
            onClose={() => setShowAuthPopup(false)}
          />
          <MobileAuthPopup
            buttonText={buttonText}
            onClose={() => setShowAuthPopup(false)}
          />
        </>
      )}

      {isMenuClicked && <SideBar menuClicked={isMenuClicked} />}

      <div className="flex justify-between py-5 w-[90%] md:w-[80%] border-b border-black-500 items-center">
        <div className="mx-auto lg:mx-0 flex items-center w-full">
          {/* Menu button on small devices */}
          {isMenuClicked ? (
            <div className="w-[30px] h-[30px] md:w-[40px] md:h-[40px] flex items-center justify-center">
              <button
                onClick={handleMenuClicked}
                type="button"
                className="lg:hidden w-[20px] h-[20px] md:w-[25px] md:h-[25px]"
              >
                <Image
                  src="/assets/images/cancel.svg"
                  alt="Menu icon"
                  width={40}
                  height={40}
                />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleMenuClicked}
              className="lg:hidden w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
            >
              <Image
                src="/assets/images/menu.svg"
                alt="Menu icon"
                width={40}
                height={40}
              />
            </button>
          )}

          <Link
            href="/"
            className="absolute left-1/2 transform -translate-x-1/2 lg:static lg:translate-x-0"
          >
            <h1 className="text-2xl md:text-4xl font-bold">Abonten</h1>
          </Link>
        </div>

        {user ? (
          <div className="hidden lg:flex items-center gap-10 min-w-fit">
            <Link href="#" className="flex gap-1 items-center">
              <Image
                src="/assets/images/post.svg"
                alt="Post"
                width={30}
                height={30}
              />
              Post
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex gap-1 items-center"
            >
              <Image
                src="/assets/images/signout.svg"
                alt="Post"
                width={30}
                height={30}
              />
              SignOut
            </button>

            <Link
              href="/user-account"
              className={cn(
                "bg-transparent rounded-full font-bold border-black",
                { hidden: isUserAccount },
              )}
            >
              <Image
                src={
                  profilePicture
                    ? profilePicture
                    : "/assets/images/AnonymousProfile.jpg"
                }
                alt="Profile Picture"
                width={60}
                height={60}
                className="rounded-full"
              />
            </Link>
          </div>
        ) : (
          <div className="space-x-5 hidden lg:flex">
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold border-black"
              onClick={handleClick}
            >
              Sign Up
            </Button>
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold border-black"
              onClick={handleClick}
            >
              Sign In
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
