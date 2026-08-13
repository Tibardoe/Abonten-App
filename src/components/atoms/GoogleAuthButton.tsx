import { signInWithGoogle } from "@/services/authService";
import { generateSlug } from "@/utils/geerateSlug";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import Notification from "./Notification";

type GoogleTextProp = {
  location: string | null;
  next?: string | null;
};

export default function GoogleAuthButton({ location, next }: GoogleTextProp) {
  const t = useTranslations("auth");
  const [notification, setNotification] = useState<string | null>(null);

  const handleSignin = async () => {
    try {
      await signInWithGoogle(generateSlug(location ?? ""), next);
    } catch (error) {
      console.error("Google Sign-In Error:", error);

      setNotification(t("googleSignInFailed"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleSignin}
        className="flex items-center w-full bg-black bg-opacity-5 p-3 rounded-md"
      >
        <FcGoogle className="text-2xl md:text-4xl" />

        <p className="mx-auto">{t("continueWithGoogle")}</p>
      </button>
      <Notification notification={notification} />
    </>
  );
}
