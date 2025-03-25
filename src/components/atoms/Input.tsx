"use client";

import { useState } from "react";

type inputProp = {
  title: string;
  inputPlaceholder: string;
  value: string;
  onchange: (string: string) => void;
};

export default function Input({
  title,
  inputPlaceholder,
  value,
  onchange,
}: inputProp) {
  const [inputFieldDisabled, setInputFieldDisabled] = useState(true);

  return (
    <div className="space-y-3">
      <h2 className="font-bold">{title}</h2>
      <div className="w-full flex justify-between items-center gap-5">
        <input
          type="text"
          placeholder={inputPlaceholder}
          value={value}
          onChange={(e) => onchange(e.target.value)}
          disabled={inputFieldDisabled}
          className="bg-transparent outline-none text-xl flex-1"
        />

        <button
          type="button"
          onClick={() => setInputFieldDisabled(false)}
          className={`${title} === "Bio"` && "hidden"}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
