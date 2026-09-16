// Canonical site paths for content. Mobile deep links and web routes agree
// on these; the app's +native-intent.ts translates them to native screens.

export function spotlightPath(postId: string): string {
  return `/spotlight/${encodeURIComponent(postId)}`;
}

export function storyPath(postId: string): string {
  return `/stories/${encodeURIComponent(postId)}`;
}

export function spotlightSurfacePath(surface: string): string {
  return surface === "for_you" ? "/spotlight" : `/spotlight?tab=${surface}`;
}
