import type { NextRequest } from "next/server";
import { updateSession } from "./config/supabase/middleware";
// import createMiddleware from "next-intl/middleware";
// import { routing } from "./i18n/routing";

// const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // const intlResponse = intlMiddleware(request);

  const response = await updateSession(request);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    //  '/((?!api|trpc|_next|_vercel|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
