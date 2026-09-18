import type { VideoPlayer } from "expo-video";

// Exactly one Spotlight/Story player may be audible at a time, app-wide.
//
// Each feed page owns its own player, so the lifecycle of one can never
// leak into another the way a single shared, re-sourced player did (the old
// feed loaded each page's video into ONE player with replaceAsync; the page
// change also called play() before that load finished, so the previous
// video's audio played over the next page's poster). Pages still pause
// themselves when they stop being active, but React effect order between
// two pages is not a contract; this is. Before any player starts, whichever
// player held playback is paused synchronously, in the same call.

let owner: VideoPlayer | null = null;

export function claimPlayback(player: VideoPlayer): void {
  if (owner && owner !== player) {
    try {
      owner.pause();
    } catch {
      // Already released.
    }
  }
  owner = player;
}

/** Called when a player pauses for good or is released. */
export function releasePlayback(player: VideoPlayer): void {
  if (owner === player) owner = null;
}
