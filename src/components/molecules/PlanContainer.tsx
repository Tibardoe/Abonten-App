type PlanContainerProp = {
  subscriptionName: string;
  subscriptionDetails: string;
  subscriptionPrice: string;
};

export default function PlanContainer({
  subscriptionName,
  subscriptionDetails,
  subscriptionPrice,
}: PlanContainerProp) {
  return (
    <button
      type="button"
      className="w-full md:h-36 grid grid-cols-[120px_1fr_auto] gap-5 md:grid-cols-[150px_1fr_auto] border-[4px] md:border-[6px] items-center justify-start border-black"
    >
      <span className="w-full h-full p-5 grid place-items-center bg-black bg-opacity-5">
        <h2 className="font-bold md:text-xl"> {subscriptionName}</h2>
      </span>
      <span className="w-full text-sm md:text-lg text-start py-5">
        <p>{subscriptionDetails}</p>
      </span>
      <span className="w-full p-5 grid place-items-center md:text-lg ">
        <p>{subscriptionPrice}</p>
      </span>
    </button>
  );
}
