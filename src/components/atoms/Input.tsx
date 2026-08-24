"use client";

import { forwardRef, useRef, useState } from "react";

type inputProp = {
  title?: string;
  inputPlaceholder: string;
} & React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>;

const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, inputProp>(
  ({ title, inputPlaceholder, ...props }, ref) => {
    const [inputFieldDisabled, setInputFieldDisabled] = useState(true);

    const inputRef = useRef<HTMLInputElement | null>(null);

    const handleClick = () => {
      setInputFieldDisabled((prevState) => !prevState);
      setTimeout(() => inputRef.current?.focus(), 0);
    };

    return (
      <div className="space-y-2">
        <label htmlFor={title} className="font-medium md:text-lg">
          {title}
        </label>

        <div className="flex w-full items-center gap-5 rounded-md border border-input bg-background p-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring has-[:disabled]:opacity-50">
          {title === "Bio" ? (
            <textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-lg lg:text-xl"
              placeholder={inputPlaceholder}
              {...props}
            />
          ) : (
            <input
              type="text"
              ref={(e) => {
                inputRef.current = e;
                if (typeof ref === "function") {
                  ref(e);
                } else if (ref) {
                  (
                    ref as React.MutableRefObject<HTMLInputElement | null>
                  ).current = e;
                }
              }}
              placeholder={inputPlaceholder}
              disabled={title === "Bio" ? false : inputFieldDisabled}
              className="flex-1 cursor-text bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-lg lg:text-xl"
              {...props}
            />
          )}

          <button
            type="button"
            onClick={handleClick}
            className={
              title === "Bio"
                ? "hidden"
                : "flex font-semibold text-foreground/70"
            }
          >
            Edit
          </button>
        </div>
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
