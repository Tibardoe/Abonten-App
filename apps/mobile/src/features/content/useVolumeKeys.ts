import { useEffect, useRef } from "react";
import { addVolumeListener } from "../../../modules/volume-observer/src";

/**
 * Hardware volume buttons on a Spotlight, the way short-video apps behave:
 * while the feed is on screen and muted, pressing volume UP turns the sound
 * on; turning the volume all the way DOWN shows it as muted.
 *
 * Nothing intercepts the keys — the platform still changes the device
 * volume as usual; this only listens for the change (a native observer on
 * the media stream / output volume). Two honest limits: a press at maximum
 * volume changes nothing, so there is nothing to hear; and on an app build
 * that predates the observer the on-screen sound button is the only switch.
 */
export function useVolumeKeys(
  enabled: boolean,
  muted: boolean,
  setMuted: (muted: boolean) => void,
) {
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!enabled) return;
    const sub = addVolumeListener(({ direction, volume }) => {
      if (direction === "up" && mutedRef.current) setMuted(false);
      else if (direction === "down" && volume <= 0 && !mutedRef.current) {
        setMuted(true);
      }
    });
    return () => sub?.remove();
  }, [enabled, setMuted]);
}
