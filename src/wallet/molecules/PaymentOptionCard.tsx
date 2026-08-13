import MaskIcon from "@/components/atoms/MaskIcon";

type PaymentOptionCardProp = {
  imgUrl: string;
  optionTitle: string;
  optionDetails: string;
  handleStep: (title: string) => void;
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
      onClick={() => handleStep(optionTitle)}
      className="rounded-lg flex gap-3 border border-border w-full p-3"
    >
      <MaskIcon src={imgUrl} alt="option icon" className="w-10 h-10" />

      <div className="flex flex-col items-start">
        <h2 className="font-bold">{optionTitle}</h2>
        <p className="text-sm">{optionDetails}</p>
      </div>
    </button>
  );
}
