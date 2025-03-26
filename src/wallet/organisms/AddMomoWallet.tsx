import { useForm } from "react-hook-form";

import Image from "next/image";

type PopupCloseProp = {
  onclick: () => void;
};

export default function AddMomoWallet({ onclick }: PopupCloseProp) {
  const form = useForm();

  const { register } = form;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full h-[80%] md:h-0 md:w-[60%] lg:w-[50%] bg-white rounded-t-3xl md:rounded-xl pt-5 p-3 md:p-5 space-y-5 pb-16 md:pb-20"
    >
      <div className="hidden md:flex justify-between items-center">
        <h1 className="font-bold text-lg">Add wallet</h1>

        <button type="button" onClick={onclick}>
          <Image
            src="/assets/images/circularCancel.svg"
            alt="Close"
            width={25}
            height={25}
          />
        </button>
      </div>

      <form>
        <label htmlFor="phone">Mobile Money Number</label>
        <input type="text" {...register("phone")} />

        <label htmlFor="mobile money network">
          Select Mobile Money Network
        </label>
        <select name="mobile money network">
          <option value="AT Money">AT Money</option>
        </select>
      </form>
    </div>
  );
}
