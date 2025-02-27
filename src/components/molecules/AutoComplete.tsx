import Image from "next/image";
import Link from "next/link";

export default function AutoComplete() {
  return (
    <div>
      <input
        type="text"
        className="p-2 md:p-4 text-black rounded-lg text-lg outline-none md:min-w-[400px]"
      />
    </div>
  );
}
