import Image from "next/image";

export default function FilterSearchBar() {
  return (
    <div className="w-full md:w-fit bg-black bg-opacity-10 rounded-lg flex justify-between p-3">
      <div className="flex gap-5">
        <Image
          className="w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
          src="/assets/images/search.svg"
          alt="Search icon"
          width={40}
          height={40}
        />
        <input
          type="text"
          placeholder="Explore events"
          className="outline-none text-lg bg-transparent mr-5"
        />
      </div>

      <button type="button">
        <Image
          className="w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
          src="/assets/images/filter.svg"
          alt="Search icon"
          width={40}
          height={40}
        />
      </button>
    </div>
  );
}
