"use client";

import { Button } from "@/components/ui";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/** Copies `text` to the clipboard and says so for two seconds. */
export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // No clipboard (an older browser, or the page is not focused): the
      // text stays selectable in its box.
      setState("failed");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      disabled={!text}
      aria-live="polite"
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Select and copy"
          : label}
    </Button>
  );
}
