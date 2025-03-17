import { signInWithGoogle } from "@/services/authService";
import Image from "next/image";
import { useRouter } from "next/navigation";

type GoogleTextProp = {
  buttonText: string;
  location: string | null;
};

export default function GoogleAuthButton({
  buttonText,
  location,
}: GoogleTextProp) {
  const router = useRouter();

  const handleSignin = async () => {
    try {
      const { url } = await signInWithGoogle(location);

      router.push(url);
    } catch (error) {
      console.error("Google Sign-In Error:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignin}
      className="flex items-center w-full bg-black bg-opacity-10 px-20 py-4 md:p-4 md:text-lg lg:text-xl rounded-xl"
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
  );
}
