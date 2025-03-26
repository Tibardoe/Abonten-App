import Image from "next/image";

type PaymentOptionCardProp = {
  imgUrl: string;
  optionTitle: string;
  optionDetails: string;
  handleStep: () => void;
};

export default function PaymentOptionCard({
  imgUrl,
  optionTitle,
  optionDetails,
  handleStep,
}: PaymentOptionCardProp) {
  return (
    <button
      type="button"
      onClick={handleStep}
      className="rounded-lg flex gap-3 border border-black border-opacity-40 w-full p-3"
    >
      <Image src={imgUrl} alt="option icon" width={40} height={40} />

      <div className="flex flex-col items-start">
        <h2 className="font-bold">{optionTitle}</h2>
        <p className="text-sm">{optionDetails}</p>
      </div>
    </button>
  );
}
