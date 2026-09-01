"use client";

import * as React from "react";

// =========================================================
// Grabbing a card by the card.
//
// Every board in the app used to hang its drag listeners on a 20px grip in the
// gutter. The card looked draggable and wasn't: you grabbed it, nothing moved,
// and the columns read as fixed shelves rather than places you put things.
//
// The pointer belongs on the body. The grip stays — it is the visible
// affordance and it carries the keyboard path (`attributes` + `listeners`, so
// space lifts and the arrows move), which a plain div can never have.
//
// A press that never travels far enough to pass the sensor's activation
// distance is still a click, so controls inside a card keep working. What is
// excluded is anything where a press-and-move means something else already:
// typing, selecting text, ticking a box, opening a menu. Those are the things
// a finger lands on deliberately, and stealing them would be worse than the
// bug this fixes.
// =========================================================

/**
 * A press here never starts a drag. Text fields because dragging inside one
 * selects; controls because a 4px wobble while clicking one must still be a
 * click, not a move.
 */
const BLOCKED = [
  "[data-no-drag]",
  "input", "textarea", "select",
  '[contenteditable=""]', '[contenteditable="true"]',
  "button", "a[href]",
  '[role="button"]', '[role="checkbox"]', '[role="switch"]',
  '[role="menuitem"]', '[role="tab"]', '[role="slider"]',
].join(", ");

/**
 * Put this on the one element that is the card's *content* rather than one of
 * its controls — nearly always the title, which has to be a real button so it
 * can be clicked and focused. It opts that button back into starting a drag,
 * which is what makes the card feel like an object instead of a form.
 */
export const DRAG_OK = { "data-drag-ok": "" } as const;

/** Cursor for a surface that can be picked up. */
export const DRAG_BODY_CLASS = "cursor-grab active:cursor-grabbing";

export type DragListeners = Record<string, unknown> | undefined;

function startsDrag(target: EventTarget | null): boolean {
  const el = target as Element | null;
  const blocker = el?.closest?.(BLOCKED);
  return !blocker || blocker.hasAttribute("data-drag-ok");
}

/**
 * Pointer-only drag activation for a card or row body.
 *
 * Spread the result on the element that *looks* draggable. Keep dnd-kit's own
 * `attributes`/`listeners` on the grip so the keyboard path survives — and mark
 * the grip `data-no-drag` so a press on it activates once, not twice.
 */
export function useDragBody(
  listeners: DragListeners,
  enabled = true,
): { onPointerDown?: React.PointerEventHandler<HTMLElement> } {
  const down = listeners?.onPointerDown as React.PointerEventHandler<HTMLElement> | undefined;

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.defaultPrevented) return;
      if (!startsDrag(event.target)) return;
      down?.(event);
    },
    [down],
  );

  if (!enabled || !down) return {};
  return { onPointerDown };
}
