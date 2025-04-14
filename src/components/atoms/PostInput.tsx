"use client";

import { forwardRef, useRef, useState } from "react";

type inputProp = {
  inputPlaceholder: string;
} & React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>;

const PostInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, inputProp>(
  ({ title, inputPlaceholder, ...props }, ref) => {
    const [inputFieldDisabled, setInputFieldDisabled] = useState(true);

    const inputRef = useRef<HTMLInputElement | null>(null);

    const handleClick = () => {
      setInputFieldDisabled((prevState) => !prevState);
      setTimeout(() => inputRef.current?.focus(), 0);
    };

    return (
      <div className="space-y-2">
        <div className="w-full flex justify-between items-center gap-5 p-3">
          {inputPlaceholder === "Description" ? (
            <textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              className="bg-transparent outline-none text-md md:textlg lg:text-xl flex-1"
              rows={5}
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
              className="bg-transparent outline-none text-md md:textlg lg:text-xl flex-1"
              {...props}
            />
          )}
        </div>

        <hr />
      </div>
    );
  },
);

PostInput.displayName = "PostInput";

export default PostInput;
