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
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignin = async () => {
    setIsSigningIn(true);

    try {
      await signInWithGoogle(generateSlug(location ?? ""), next);
      // No need to reset isSigningIn on success -- signInWithOAuth navigates
      // the browser away to Google before this function returns.
    } catch (error) {
      console.error("Google Sign-In Error:", error);

      setNotification(t("googleSignInFailed"));
      setIsSigningIn(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleSignin}
        disabled={isSigningIn}
        className="flex items-center w-full bg-muted p-3 rounded-md disabled:opacity-70"
      >
        <FcGoogle className="text-2xl md:text-4xl" />

        <p className="mx-auto">
          {isSigningIn ? t("redirecting") : t("continueWithGoogle")}
        </p>
      </button>
      <Notification notification={notification} />
    </>
  );
}
