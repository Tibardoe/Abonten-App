import Image from "next/image";

type GoogleTextProp = {
  buttonText: string;
};

export default function GoogleAuthButton({ buttonText }: GoogleTextProp) {
  return (
    <button
      type="button"
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
