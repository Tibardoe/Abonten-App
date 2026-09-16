"use client";

import { cn } from "@/components/lib/utils";
import { useState } from "react";

// A caption that clamps to two lines until the visitor expands it. Hashtags
// are emphasised but not linked yet: hashtag pages are not part of this
// release.
export default function ContentCaption({
  caption,
  className,
}: {
  caption: string | null;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = caption?.trim();
  if (!text) return null;

  const parts = text.split(/(#[\p{L}\p{N}_]+)/u);
  const long = text.length > 90 || text.includes("\n");

  return (
    <div className={cn("text-sm text-white", className)}>
      <p
        className={cn(
          "whitespace-pre-wrap break-words",
          !expanded && "line-clamp-2",
        )}
      >
        {parts.map((part, i) =>
          part.startsWith("#") ? (
            <span key={`${i}-${part}`} className="font-semibold">
              {part}
            </span>
          ) : (
            <span key={`${i}-${part.slice(0, 8)}`}>{part}</span>
          ),
        )}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-xs font-semibold text-white/80 hover:text-white"
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}
