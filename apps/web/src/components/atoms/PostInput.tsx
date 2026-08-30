"use client";

import { forwardRef, useRef } from "react";
import { cn } from "../lib/utils";

type inputProp = {
  inputPlaceholder: string;
  type: string;
} & React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>;

const PostInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, inputProp>(
  ({ type, inputPlaceholder, className, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement | null>(null);

    return (
      <div className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
        {inputPlaceholder === "Description" ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            className={cn(
              "w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm",
              className,
            )}
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
            className={cn(
              "w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm",
              className,
            )}
            {...props}
          />
        )}
      </div>
    );
  },
);

PostInput.displayName = "PostInput";

export default PostInput;
