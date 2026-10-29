"use client";

import { getSignInUrl } from "@abonten/core/getSignInUrl";
import { usePathname } from "next/navigation";

/**
 * The header's and side menu's Sign in / Sign up: brings the person back to
 * the page they were reading (an event, a place, a profile) once signed in.
 * From Home or the sign-in screen itself it is plain /auth/signin, which
 * lands on Explore.
 */
export function useSignInHref(): string {
  const pathname = usePathname();
  if (!pathname || pathname === "/" || pathname.startsWith("/auth")) {
    return "/auth/signin";
  }
  return getSignInUrl(pathname);
}
