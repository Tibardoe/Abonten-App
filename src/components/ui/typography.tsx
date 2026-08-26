import * as React from "react";

import { cn } from "../lib/utils";

// Deliberate, consistent heading scale: the app's headings were previously
// hand-styled per page with inconsistent size/weight combinations (a
// dashboard <h1> ended up styled identically to another page's <h2>). These
// wrap the semantic tag with a fixed size + weight so hierarchy stays the
// same everywhere they're used, while still accepting className for one-off
// layout overrides (spacing, color, text-align).
export const PageTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h1
    ref={ref}
    className={cn("text-xl font-semibold md:text-2xl", className)}
    {...props}
  />
));
PageTitle.displayName = "PageTitle";

export const SectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
));
SectionTitle.displayName = "SectionTitle";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-base font-medium", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

export const SupportingText = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SupportingText.displayName = "SupportingText";
