import { signInWithGoogle } from "@/services/authService";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import { useState } from "react";
import Notification from "./Notification";

type GoogleTextProp = {
  buttonText: string;
  location: string | null;
};

export default function GoogleAuthButton({
  buttonText,
  location,
}: GoogleTextProp) {
  const [notification, setNotification] = useState<string | null>(null);

  const handleSignin = async () => {
    try {
      await signInWithGoogle(generateSlug(location ?? ""));
    } catch (error) {
      console.error("Google Sign-In Error:", error);

      setNotification("Failed to sign in with Google. Try again.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleSignin}
        className="flex items-center w-full bg-black bg-opacity-5 px-20 py-4 md:p-4 md:text-lg lg:text-xl rounded-xl"
      >
        <Image
          src="/assets/images/google.svg"
          alt="Google logo"
          width={40}
          height={40}
          className="w-[25px] md:w-[30px] lg:w-[40px] h-[25px] md:h-[30px] lg:h-[35px]"
        />
        <p className="mx-auto text-lg">{buttonText} with Google</p>
      </button>
      <Notification notification={notification} />
    </>
  );
}
