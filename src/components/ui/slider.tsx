"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "../lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, value, defaultValue, ...props }, ref) => {
  // Render one Thumb per value in the array so this same component covers
  // both a single-handle slider and a two-handle range slider (Radix's
  // primitive requires one <Thumb> per value; it doesn't infer the count).
  const thumbCount = (value ?? defaultValue ?? [0]).length;

  return (
    <SliderPrimitive.Root
      ref={ref}
      value={value}
      defaultValue={defaultValue}
      className={cn(
        "relative flex w-full touch-none select-none items-center py-3",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }).map((_, i) => (
        <SliderPrimitive.Thumb
          // biome-ignore lint/suspicious/noArrayIndexKey: thumb count/order is fixed for the lifetime of a given slider instance
          key={i}
          // 28px is an adequate touch target (>= WCAG 2.5.8's 24px). The
          // previous `before:-inset-2.5` grew each thumb's hit area to 48px,
          // so on a range slider the two invisible boxes overlapped whenever
          // the thumbs came close and the top one swallowed every press --
          // making the other thumb impossible to grab (worst on touch).
          // `focus-visible:z-10` / `hover:z-10` bring the interacted thumb to
          // the front if they ever coincide; `active:scale-110` is a clear
          // drag cue on both mouse and touch.
          className="relative block h-7 w-7 shrink-0 rounded-full border-2 border-primary bg-background shadow-md transition-[transform,box-shadow] hover:z-10 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-110 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
