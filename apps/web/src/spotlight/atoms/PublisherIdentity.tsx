import { cn } from "@/components/lib/utils";
import type { ContentPublisher } from "@abonten/types/contentType";
import Image from "next/image";
import Link from "next/link";
import { MdVerified } from "react-icons/md";
import {
  publisherAvatarUrl,
  publisherHref,
  publisherLabel,
} from "../lib/publisher";

// Avatar + name (+ verified tick) for whoever published a post. Links to
// the organizer profile or the place page; Abonten itself has no page.
export default function PublisherIdentity({
  publisher,
  size = 36,
  subtitle,
  onNavigate,
  className,
  tone = "light",
}: {
  publisher: ContentPublisher;
  size?: number;
  subtitle?: string;
  onNavigate?: () => void;
  className?: string;
  /** "light" for text over media, "default" for normal surfaces. */
  tone?: "light" | "default";
}) {
  const href = publisherHref(publisher);
  const body = (
    <>
      <span
        className="relative shrink-0 overflow-hidden rounded-full bg-muted"
        style={{ width: size, height: size }}
      >
        <Image
          src={publisherAvatarUrl(publisher, size)}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold">
            {publisherLabel(publisher)}
          </span>
          {publisher.verified ? (
            <MdVerified
              aria-label="Verified"
              className={cn(
                "shrink-0 text-sm",
                tone === "light" ? "text-white" : "text-primary",
              )}
            />
          ) : null}
        </span>
        {subtitle ? (
          <span
            className={cn(
              "block truncate text-xs",
              tone === "light" ? "text-white/80" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  const classes = cn(
    "flex min-w-0 items-center gap-2",
    tone === "light" ? "text-white" : "text-foreground",
    className,
  );

  return href ? (
    <Link href={href} onClick={onNavigate} className={classes}>
      {body}
    </Link>
  ) : (
    <span className={classes}>{body}</span>
  );
}
