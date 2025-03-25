import { useState } from "react";
import { cn } from "../lib/utils";

type PlanContainerProp = {
  subscriptionName: string;
  subscriptionDetails: string;
  subscriptionPrice: string;
  activeSubscription: string;
  setActiveSubscription: (name: string) => void;
};

export default function PlanContainer({
  subscriptionName,
  subscriptionDetails,
  subscriptionPrice,
  activeSubscription,
  setActiveSubscription,
}: PlanContainerProp) {
  const isActive = subscriptionName === activeSubscription;

  const handleClick = () => {
    setActiveSubscription(subscriptionName);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full md:h-36 relative flex flex-col md:grid gap-3 md:grid-cols-[150px_1fr_auto] border-[4px] md:gap-5 md:border-[6px] items-center justify-start border-black opacity-50",
        { "opacity-100": isActive },
      )}
    >
      {isActive && (
        <span className="h-9 w-9 bg-black rounded-full grid place-items-center absolute -left-5 top-1/2 -translate-y-1/2">
          <div className="border-r-[3px] border-b-[3px] border-white w-[11px] h-5 rotate-45 -translate-y-1" />
        </span>
      )}

      <span className="w-full h-full p-5 grid place-items-center bg-black bg-opacity-5">
        <h2 className="font-bold md:text-xl"> {subscriptionName}</h2>
      </span>
      <span className="text-sm md:text-lg md:text-start px-5">
        <p>{subscriptionDetails}</p>
      </span>
      <span className="p-5 pl-0 grid place-items-center md:text-lg ">
        <p>{subscriptionPrice}</p>
      </span>
    </button>
  );
}
