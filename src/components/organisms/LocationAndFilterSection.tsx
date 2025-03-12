import Image from "next/image";
import { useSearchParams } from "next/navigation";
import FilterSearchBar from "../molecules/FilterSearchBar";

export default function LocationAndFilterSection() {
  const searchParams = useSearchParams();

  const location = searchParams.get("location");

  return (
    <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
      <button
        type="button"
        className="flex gap-3 items-center text-lg md:text-xl"
      >
        <Image
          className="w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
          src="/assets/images/location.svg"
          alt="Location icon"
          width={40}
          height={40}
        />
        <p>{location}</p>
      </button>
      <FilterSearchBar />
    </div>
  );
}
