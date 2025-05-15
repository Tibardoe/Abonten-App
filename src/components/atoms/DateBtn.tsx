import { cn } from "../lib/utils";

type DateBtnProp = {
  key: string;
  dateString: string;
  day: string;
  month: string;
  date: number;
  time: string;
  isActive: boolean;
  onClick: () => void;
};

export default function DateBtn({
  day,
  month,
  date,
  time,
  dateString,
  onClick,
  isActive,
}: DateBtnProp) {
  return (
    <button
      type="button"
      key={dateString}
      onClick={onClick}
      className={cn(
        "rounded-md border px-4 py-2 flex-shrink-0 space-y-2 shadow-md text-sm min-w-32",
        { "border-black": isActive },
      )}
    >
      <p className="font-bold">{day}</p>

      <hr />

      <p>{month}</p>

      <p
        className={cn(
          "rounded-full w-16 h-16 grid place-items-center text-2xl bg-gray-200 mx-auto",
          { "bg-black text-white": isActive },
        )}
      >
        {date}
      </p>

      <p>{time}</p>
    </button>
  );
}
