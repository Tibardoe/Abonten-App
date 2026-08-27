"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "../lib/utils";

// Confirmation-dialog primitive with shadcn AlertDialog's API shape, built on
// the already-installed @radix-ui/react-dialog (this repo has no separate
// @radix-ui/react-alert-dialog dependency, and one isn't needed -- the only
// real difference for our usage is role="alertdialog" plus guarding
// Escape/outside-click while a caller-supplied action is in flight, both of
// which are easy to layer on Dialog directly). Every caller keeps full
// control of open/close via mount/unmount (matching how ConfirmDeleteModal
// and SaveDraftConfirmDialog were used before this existed), so there is no
// internal open state here.
const AlertDialog = DialogPrimitive.Root;

const AlertDialogPortal = DialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-overlay/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";

type AlertDialogContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  /** Blocks Escape/outside-click dismissal while a confirm/save action is running. */
  preventCloseWhileBusy?: boolean;
};

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  AlertDialogContentProps
>(
  (
    {
      className,
      preventCloseWhileBusy,
      onEscapeKeyDown,
      onPointerDownOutside,
      ...props
    },
    ref,
  ) => (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        role="alertdialog"
        onEscapeKeyDown={(event) => {
          if (preventCloseWhileBusy) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (preventCloseWhileBusy) event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-[85%] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 md:w-full md:max-w-md",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  ),
);
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1.5 text-center", className)}
    {...props}
  />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-center",
      className,
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
