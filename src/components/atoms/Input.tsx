"use client";

import { useRef, useState } from "react";

type inputProp = {
  title: string;
  inputPlaceholder: string;
};

export default function Input({ title, inputPlaceholder }: inputProp) {
  const [inputFieldDisabled, setInputFieldDisabled] = useState(true);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    setInputFieldDisabled((prevState) => !prevState);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="space-y-2">
      <label htmlFor={title} className="font-bold md:text-lg">
        {title}
      </label>

      <div className="w-full flex justify-between items-center gap-5 p-3 rounded-md border border-black border-opacity-30">
        {title === "Bio" ? (
          <textarea
            className="bg-transparent outline-none text-md md:textlg lg:text-xl flex-1"
            placeholder={inputPlaceholder}
          />
        ) : (
          <input
            type="text"
            ref={inputRef}
            placeholder={inputPlaceholder}
            disabled={title === "Bio" ? false : inputFieldDisabled}
            className="bg-transparent outline-none text-md md:textlg lg:text-xl flex-1"
          />
        )}

        <button
          type="button"
          onClick={handleClick}
          className={title === "Bio" ? "hidden" : "flex font-bold"}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
