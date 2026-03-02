import { cn } from "../lib/utils";

type DateBtnProp = {
  key: string;
  dateString: string;
  day: string;
  month: string;
  date: number;
  start_at: string;
  is_past: boolean;
  isActive: boolean;
  onClick: () => void;
};

export default function DateBtn({
  day,
  month,
  date,
  start_at,
  is_past,
  dateString,
  onClick,
  isActive,
}: DateBtnProp) {
  const now = new Date();

  return (
    <button
      type="button"
      key={dateString}
      disabled={is_past}
      onClick={onClick}
      className={cn(
        "rounded-md border px-4 py-2 flex-shrink-0 space-y-2 shadow-md text-sm min-w-32",
        {
          "border-black": isActive,
          "cursor-not-allowed text-gray-400": is_past,
        },
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

      <p>{start_at}</p>
    </button>
  );
}
