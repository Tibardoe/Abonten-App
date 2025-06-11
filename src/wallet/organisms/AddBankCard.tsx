import { Button } from "@/components/ui/button";
// import { networks } from "@/utils/networkProviderData";
import Image from "next/image";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onclick: () => void;
};

export default function AddBankCard({ onclick }: PopupCloseProp) {
  const form = useForm();

  const { register } = form;

  const [_showDropdown, setShowDropdown] = useState(false);

  // const handleDropdown = () => {
  //   setShowDropdown((prevState) => !prevState);
  // };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full h-screen md:h-fit md:w-[60%] lg:w-[50%] bg-white md:rounded-xl pt-5 p-3 md:p-5 space-y-5 pb-16 md:pb-20"
    >
      <div className="hidden md:flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">Add Bank Card</h1>
          <p className="opacity-50">
            Add your Visa or Mastercard details to pay
          </p>
        </div>

        <button type="button" onClick={onclick}>
          <Image
            src="/assets/images/circularCancel.svg"
            alt="Close"
            width={25}
            height={25}
          />
        </button>
      </div>

      {/* Mobile header */}
      <div className="flex flex-col gap-2 md:hidden pb-10">
        <div className="flex items-center w-full">
          <button type="button" onClick={onclick}>
            <Image
              src="/assets/images/arrowLeft.svg"
              alt="Close"
              width={30}
              height={30}
              className="self-start"
            />
          </button>
          <h1 className="font-bold text-xl m-auto">Add Bank Card</h1>
        </div>

        <p className="text-center text-sm">
          Add your Visa or Mastercard to pay
        </p>
      </div>

      <form className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="phone" className="text-sm">
            Card number
          </label>
          <div className="border border-black rounded-md border-opacity-30 px-4 py-2 bg-white">
            <input
              type="tel"
              inputMode="numeric"
              className="outline-none w-full"
              {...register("creditCard")}
              placeholder="Eg. 1234 1234 1234 1234"
            />
          </div>
        </div>

        <div className="flex gap-5">
          <div className="flex flex-col gap-2 w-full">
            <label htmlFor="phone" className="text-sm">
              Card Expiry
            </label>
            <div className="border border-black rounded-md border-opacity-30 px-4 py-2 bg-white">
              <input
                type="tel"
                className="outline-none w-full"
                {...register("phone")}
                placeholder="MM/YY"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <label htmlFor="phone" className="text-sm">
              CVV
            </label>
            <div className="border border-black rounded-md border-opacity-30 px-4 py-2 bg-white">
              <input
                type="password"
                className="outline-none w-full"
                {...register("phone")}
                placeholder="***"
              />
            </div>
          </div>
        </div>

        <span className="p-3 rounded-md bg-black bg-opacity-5 text-center font-semibold text-sm">
          <p>
            Note: Only bank cards registered in your name can be added to your
            account
          </p>
        </span>

        <Button className="font-semibold md:self-end rounded-full md:rounded-md py-6 text-lg md:text-sm mt-52 md:mt-0">
          Save This Wallet
        </Button>
      </form>
    </div>
  );
}
