"use client";

import { forwardRef, useRef } from "react";

type inputProp = {
  inputPlaceholder: string;
  type: string;
} & React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>;

const PostInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, inputProp>(
  ({ type, inputPlaceholder, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement | null>(null);

    return (
      <div className="space-y-2">
        <div className="w-full flex justify-between items-center gap-5 p-3 md:p-0">
          {inputPlaceholder === "Description" ? (
            <textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              className="bg-transparent outline-none text-md w-full"
              rows={5}
              placeholder={inputPlaceholder}
              {...props}
            />
          ) : (
            <input
              type={type}
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
              className="bg-transparent outline-none text-md w-full"
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
