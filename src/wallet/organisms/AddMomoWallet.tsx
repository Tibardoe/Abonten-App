import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
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
      className="w-full h-screen md:h-fit md:w-[60%] lg:w-[50%] bg-white md:rounded-xl pt-5 p-3 md:p-5 space-y-5 pb-16 md:pb-20"
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

      <form className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="phone" className="text-sm">
            Mobile Money Number
          </label>
          <div className="border border-black rounded-md border-opacity-30 px-4 py-2 bg-white">
            <input
              type="text"
              className="outline-none w-full"
              {...register("phone")}
              placeholder="Eg. +233 54 927 3094"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="mobile money network" className="text-sm">
            Select Mobile Money Network
          </label>

          <div className="border border-black rounded-md border-opacity-30 px-4 py-2 bg-transparent">
            <select
              name="mobile money network"
              className="bg-white outline-none w-full"
            >
              <option value="AT Money">Select mobile network</option>

              <option value="AT Money">AT Money</option>
            </select>
          </div>
        </div>

        <Button className="font-semibold self-end">Save This Wallet</Button>
      </form>
    </div>
  );
}
