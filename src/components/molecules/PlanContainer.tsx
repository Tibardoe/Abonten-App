import { cn } from "../lib/utils";

type PlanContainerProp = {
  subscriptionName: string;
  subscriptionDetails: string;
  subscriptionPrice: string;
  activeSubscription: string | null;
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
        <span className="bg-mint rounded-full grid place-items-center absolute top-1/2 -translate-y-1/2 -left-4 h-6 w-6 md:h-9 md:w-9 md:-left-5">
          <div className="border-r-[2.5px] border-b-[2.5px] border-white w-[8px] h-4 rotate-45 -translate-y-[2px] md:-translate-y-1 md:border-r-[3px] md:border-b-[3px] md:w-[11px] md:h-5" />
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
