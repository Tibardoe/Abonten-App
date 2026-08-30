"use client";

import type { MediaItem } from "@abonten/types/mediaItemType";
import {
  AnimatePresence,
  type PanInfo,
  motion,
  useReducedMotion,
} from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

// A drag past either threshold navigates; a slow-but-far drag clears the
// distance threshold even at near-zero velocity, and a fast flick clears
// the velocity threshold even over a short distance -- matching WhatsApp
// / Instagram-style swipe feel rather than a single rigid rule.
const DISTANCE_THRESHOLD = 100;
const VELOCITY_CONFIDENCE_THRESHOLD = 8000;

function swipePower(offset: number, velocity: number) {
  return Math.abs(offset) * velocity;
}

const slideVariants = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

// A user with prefers-reduced-motion still benefits from the crossfade (it
// signals "this changed"), just without the large sliding transform.
const reducedMotionVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

type MediaStageProps = {
  activeItem: MediaItem;
  direction: 1 | -1;
  currentIndex: number;
  mediaItemsLength: number;
  onNavigate: (direction: 1 | -1) => void;
  renderItem: (item: MediaItem) => ReactNode;
};

// Owns navigation/animation only -- the actual image/video markup for the
// active item is supplied by the caller via renderItem, so video ref and
// playback-state ownership stay where the rest of the video controls live.
export default function MediaStage({
  activeItem,
  direction,
  currentIndex,
  mediaItemsLength,
  onNavigate,
  renderItem,
}: MediaStageProps) {
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < mediaItemsLength - 1;
  const prefersReducedMotion = useReducedMotion();

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const power = swipePower(info.offset.x, info.velocity.x);
    const passedThreshold =
      Math.abs(info.offset.x) > DISTANCE_THRESHOLD ||
      power > VELOCITY_CONFIDENCE_THRESHOLD;

    if (!passedThreshold) return; // Snaps back to center automatically.

    if (info.offset.x < 0 && canGoNext) {
      onNavigate(1);
    } else if (info.offset.x > 0 && canGoPrev) {
      onNavigate(-1);
    }
    // At a boundary: no-op, and dragConstraints springs it back to center.
  };

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
      <button
        type="button"
        aria-label="Previous media"
        onClick={() => onNavigate(-1)}
        disabled={!canGoPrev}
        className={`hidden md:flex absolute h-24 my-auto inset-y-0 left-0 items-center justify-start pl-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
          canGoPrev ? "hover:bg-opacity-70" : "opacity-50 cursor-not-allowed"
        }`}
      >
        <ChevronLeftIcon className="w-8 h-8" />
      </button>

      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={activeItem.id}
          custom={direction}
          variants={
            prefersReducedMotion ? reducedMotionVariants : slideVariants
          }
          initial="enter"
          animate="center"
          exit="exit"
          transition={
            prefersReducedMotion
              ? { duration: 0.1 }
              : {
                  x: { type: "spring", stiffness: 300, damping: 32 },
                  opacity: { duration: 0.15 },
                }
          }
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.6}
          onDragEnd={handleDragEnd}
          className="w-full h-full flex items-center justify-center absolute inset-0"
          style={{ touchAction: "pan-y" }}
        >
          {renderItem(activeItem)}
        </motion.div>
      </AnimatePresence>

      <button
        type="button"
        aria-label="Next media"
        onClick={() => onNavigate(1)}
        disabled={!canGoNext}
        className={`hidden md:flex absolute h-24 my-auto inset-y-0 right-0 items-center justify-end pr-4 z-20 p-2 rounded-full bg-black bg-opacity-50 text-white ${
          canGoNext ? "hover:bg-opacity-70" : "opacity-50 cursor-not-allowed"
        }`}
      >
        <ChevronRightIcon className="w-8 h-8" />
      </button>
    </div>
  );
}
