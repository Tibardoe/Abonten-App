"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/authContext";
import { useShowMenu } from "@/context/uiContext";
import useUserProfile from "@/hooks/useUserProfile";
import { signOut } from "@/services/authService";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthPopup from "./AuthPopup";
import MobileAuthPopup from "./MobileAuthPopup";

export default function Header() {
  const [buttonText, setButtonText] = useState("");

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const userProfile = useUserProfile();

  const { user } = useAuth();

  const router = useRouter();

  const { toggleComponent, isMenuClicked } = useShowMenu();

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

  return (
    <nav className="w-full text flex justify-center fixed bg-white">
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

      <div className="flex justify-between py-5 w-[90%] md:w-[80%] border-b border-black-500 items-center">
        <div className="mx-auto lg:mx-0 flex items-center w-full">
          {/* Menu button on small devices */}
          {isMenuClicked ? (
            <div className="w-[30px] h-[30px] md:w-[40px] md:h-[40px] flex items-center justify-center">
              <button
                onClick={toggleComponent}
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
              onClick={toggleComponent}
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
          <div className="hidden lg:flex items-center gap-16">
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

            <button
              type="button"
              className="bg-transparent rounded-full font-bold border-black"
            >
              <Image
                src="/assets/images/AnonymousProfile.jpg"
                alt="Profile Picture"
                width={100}
                height={100}
                className="rounded-full"
              />
            </button>
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
