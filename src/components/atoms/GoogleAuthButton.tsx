import { signInWithGoogle } from "@/services/authService";
import { generateSlug } from "@/utils/geerateSlug";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
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
        className="flex items-center w-full bg-black bg-opacity-5 p-3 md:p-4 md:text-lg rounded-md"
      >
        <FcGoogle className="text-2xl md:text-4xl" />

        <p className="mx-auto">{buttonText} with Google</p>
      </button>
      <Notification notification={notification} />
    </>
  );
}
