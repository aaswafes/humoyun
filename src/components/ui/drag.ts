"use client";

import * as React from "react";
import {
  KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";

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

/**
 * Cursor for a surface that can be picked up — and, on a touch screen, no
 * text selection or iOS callout, because the long press that lifts the card is
 * exactly the gesture Safari would otherwise spend on the loupe.
 */
export const DRAG_BODY_CLASS =
  "cursor-grab active:cursor-grabbing touch:select-none touch:[-webkit-touch-callout:none]";

/** Hold this long before a finger picks a card up; anything quicker is a scroll. */
export const TOUCH_LIFT_DELAY = 220;

/**
 * The one sensor setup every board uses.
 *
 * PointerSensor cannot tell a scroll from a drag on a phone: the browser claims
 * the gesture for panning and cancels the pointer before any distance is
 * reached, so on iOS nothing could ever be dragged — and the `touch-none`
 * that would let it also stops the list from scrolling under that finger.
 * So the mouse and the finger get separate sensors:
 *
 * - mouse: moves `distance` px and it is a drag, exactly as before;
 * - touch: hold still for TOUCH_LIFT_DELAY ms, then drag. Moving first is a
 *   scroll, untouched. dnd-kit's TouchSensor registers the non-passive
 *   touchmove listener iOS Safari needs before it lets a drag stop the page;
 * - keyboard: unchanged — space lifts, arrows move.
 */
export function useAppSensors({
  distance = 4,
  coordinateGetter,
}: {
  distance?: number;
  coordinateGetter?: KeyboardCoordinateGetter;
} = {}) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_LIFT_DELAY, tolerance: 6 } }),
    useSensor(KeyboardSensor, coordinateGetter ? { coordinateGetter } : undefined),
  );
}

export type DragListeners = Record<string, unknown> | undefined;

function startsDrag(target: EventTarget | null): boolean {
  const el = target as Element | null;
  const blocker = el?.closest?.(BLOCKED);
  return !blocker || blocker.hasAttribute("data-drag-ok");
}

type Activator = (event: React.SyntheticEvent<HTMLElement>) => void;

/**
 * Pointer-only drag activation for a card or row body.
 *
 * Spread the result on the element that *looks* draggable. Keep dnd-kit's own
 * `attributes`/`listeners` on the grip so the keyboard path survives — and mark
 * the grip `data-no-drag` so a press on it activates once, not twice.
 *
 * Forwards whichever activators the board's sensors produced: `onPointerDown`
 * from a PointerSensor, `onMouseDown` + `onTouchStart` from useAppSensors.
 */
export function useDragBody(
  listeners: DragListeners,
  enabled = true,
): {
  onPointerDown?: React.PointerEventHandler<HTMLElement>;
  onMouseDown?: React.MouseEventHandler<HTMLElement>;
  onTouchStart?: React.TouchEventHandler<HTMLElement>;
} {
  const pointer = listeners?.onPointerDown as Activator | undefined;
  const mouse = listeners?.onMouseDown as Activator | undefined;
  const touch = listeners?.onTouchStart as Activator | undefined;

  const guard = React.useCallback(
    (activate: Activator | undefined, event: React.SyntheticEvent<HTMLElement>) => {
      if (!activate || event.defaultPrevented) return;
      if (!startsDrag(event.target)) return;
      activate(event);
    },
    [],
  );

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => guard(pointer, event), [guard, pointer]);
  const onMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => guard(mouse, event), [guard, mouse]);
  const onTouchStart = React.useCallback(
    (event: React.TouchEvent<HTMLElement>) => guard(touch, event), [guard, touch]);

  if (!enabled || !(pointer || mouse || touch)) return {};
  return {
    ...(pointer && { onPointerDown }),
    ...(mouse && { onMouseDown }),
    ...(touch && { onTouchStart }),
  };
}
