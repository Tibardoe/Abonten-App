import { Button } from "@/components/ui/button";
import { networks } from "@/utils/networkProviderData";
import Image from "next/image";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onclick: () => void;
};

export default function AddMomoWallet({ onclick }: PopupCloseProp) {
  const form = useForm();

  const { register } = form;

  const [showDropdown, setShowDropdown] = useState(false);

  const handleDropdown = () => {
    setShowDropdown((prevState) => !prevState);
  };

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
          <h1 className="font-bold text-xl m-auto">Add Mobile Money Wallet</h1>
        </div>

        <p className="text-center text-sm">
          Pay with your mobile money wallet from any provider
        </p>
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

          <button
            type="button"
            onClick={handleDropdown}
            className="border border-black rounded-md border-opacity-30 px-4 py-2 bg-transparent flex justify-between items-center"
          >
            <p>Select mobile network</p>
            <Image
              src="/assets/images/arrowDown.svg"
              alt="Dropdown icon"
              width={30}
              height={30}
            />
          </button>

          {showDropdown && (
            <>
              {/* for mobile */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
              <div
                onClick={onclick}
                className="flex items-end md:hidden fixed top-0 left-0 w-full bg-black bg-opacity-70 h-dvh"
              >
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
                <ul
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-white rounded-t-xl p-4"
                >
                  {networks.map((network) => (
                    <button
                      type="button"
                      key={network.network}
                      className="flex w-full gap-2 justify-start items-center border-b border-black border-opacity-30 py-3"
                    >
                      <Image
                        src={network.logo}
                        alt={network.network}
                        width={50}
                        height={50}
                      />
                      {network.network}
                    </button>
                  ))}
                </ul>
              </div>

              {/* For desktop */}
              <ul className="hidden md:flex flex-col gap-3 shadow-xl h-64 p-3 overflow-y-scroll rounded-xl">
                {networks.map((network) => (
                  <button
                    type="button"
                    key={network.network}
                    className="flex gap-2 justify-start items-center border-b border-black border-opacity-30 py-3"
                  >
                    <Image
                      src={network.logo}
                      alt={network.network}
                      width={50}
                      height={50}
                    />
                    {network.network}
                  </button>
                ))}
              </ul>
            </>
          )}
        </div>

        <Button className="font-semibold md:self-end rounded-full md:rounded-md py-6 text-lg md:text-sm">
          Save This Wallet
        </Button>
      </form>
    </div>
  );
}
