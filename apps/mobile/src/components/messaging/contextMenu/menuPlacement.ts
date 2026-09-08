// Pure geometry for the contextual action overlay (spec §2 / §16). Given
// where the pressed item sits in the window and how much room the system UI
// (status bar, keyboard, home indicator) leaves, it decides:
//
//   • whether the action menu goes ABOVE or BELOW the item,
//   • the vertical offset of the (possibly nudged) item preview,
//   • the menu's top,
//   • the accessory row's top (reaction bar — messages only), and
//   • how much the preview itself had to be pushed to keep everything
//     on-screen and clear of the keyboard / home indicator.
//
// No react-native imports — trivially unit-testable.

export type Rect = { x: number; y: number; width: number; height: number };

export type PlacementInput = {
  /** The pressed item's frame in window coordinates (measureInWindow). */
  anchor: Rect;
  screen: { width: number; height: number };
  insets: { top: number; bottom: number };
  /** Live keyboard height (0 when hidden). */
  keyboardHeight: number;
  /** Measured (or estimated) height of the action menu card. */
  menuHeight: number;
  /** Measured height of the accessory row above the menu, 0 if none. */
  accessoryHeight: number;
  /** Gap between preview / accessory / menu. */
  gap?: number;
};

export type Placement = {
  side: "above" | "below";
  /** Final Y of the lifted preview (its top edge), window coords. */
  previewTop: number;
  /** Final Y of the accessory row (reaction bar). */
  accessoryTop: number;
  /** Final Y of the menu card. */
  menuTop: number;
  /** How far the preview was nudged from where the finger was (for the
   *  lift animation's starting offset). */
  previewShift: number;
};

const DEFAULT_GAP = 8;
// Never let anything touch the very edge of the safe area.
const EDGE_PAD = 8;

export function computePlacement(input: PlacementInput): Placement {
  const gap = input.gap ?? DEFAULT_GAP;
  const { anchor, screen, insets, keyboardHeight } = input;

  const topLimit = insets.top + EDGE_PAD;
  const bottomLimit =
    screen.height - Math.max(insets.bottom, keyboardHeight) - EDGE_PAD;

  // The full stack that has to sit on one side of the preview:
  // accessory (+gap) + menu.
  const clusterHeight =
    input.menuHeight +
    (input.accessoryHeight > 0 ? input.accessoryHeight + gap : 0);

  // Keep the preview no taller than the space between the two limits so a
  // very tall bubble can still be shown with a menu.
  const maxPreviewHeight = Math.max(
    64,
    bottomLimit - topLimit - clusterHeight - gap * 2,
  );
  const previewHeight = Math.min(anchor.height, maxPreviewHeight);

  const roomBelow = bottomLimit - (anchor.y + previewHeight);
  const roomAbove = anchor.y - topLimit;
  const need = clusterHeight + gap;

  // Prefer the side the finger naturally expects (below), fall back to
  // above, then to whichever side is larger.
  let side: "above" | "below";
  if (roomBelow >= need) side = "below";
  else if (roomAbove >= need) side = "above";
  else side = roomBelow >= roomAbove ? "below" : "above";

  // Start by keeping the preview where the finger was, then clamp so the
  // whole cluster fits.
  let previewTop = anchor.y;

  if (side === "below") {
    // Cluster hangs under the preview.
    const maxPreviewTop = bottomLimit - need - previewHeight;
    if (previewTop > maxPreviewTop) previewTop = maxPreviewTop;
    if (previewTop < topLimit) previewTop = topLimit;
    const accessoryTop = previewTop + previewHeight + gap;
    const menuTop =
      accessoryTop +
      (input.accessoryHeight > 0 ? input.accessoryHeight + gap : 0);
    return {
      side,
      previewTop,
      accessoryTop,
      menuTop,
      previewShift: previewTop - anchor.y,
    };
  }

  // side === "above": cluster sits over the preview, top-to-bottom
  //   menu → reaction bar → message
  // so the reaction bar stays the affordance CLOSEST to the message (spec §6).
  const minPreviewTop = topLimit + need;
  if (previewTop < minPreviewTop) previewTop = minPreviewTop;
  if (previewTop + previewHeight > bottomLimit) {
    previewTop = bottomLimit - previewHeight;
  }
  const hasAccessory = input.accessoryHeight > 0;
  const accessoryTop = hasAccessory
    ? previewTop - gap - input.accessoryHeight
    : previewTop;
  const menuTop =
    (hasAccessory ? accessoryTop : previewTop) - gap - input.menuHeight;
  return {
    side,
    previewTop,
    accessoryTop,
    menuTop,
    previewShift: previewTop - anchor.y,
  };
}

/**
 * Horizontal placement for the menu card: hug the same side of the screen as
 * the bubble (outgoing → right, incoming → left), clamped to the safe width.
 */
export function computeMenuLeft(opts: {
  anchor: Rect;
  menuWidth: number;
  screenWidth: number;
  align: "start" | "end";
}): number {
  const pad = 12;
  const { anchor, menuWidth, screenWidth, align } = opts;
  let left = align === "end" ? anchor.x + anchor.width - menuWidth : anchor.x;
  if (left + menuWidth > screenWidth - pad)
    left = screenWidth - pad - menuWidth;
  if (left < pad) left = pad;
  return left;
}
