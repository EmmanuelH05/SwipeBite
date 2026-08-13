import { useState, useRef, useEffect, useCallback } from "react";
import {
  SWIPE_THRESHOLD,
  GESTURE_LOCK_THRESHOLD,
  SWIPE_EXIT_DISTANCE_PERCENT,
  SWIPE_EXIT_ROTATION_DEG,
  DRAG_ROTATION_FACTOR,
  SWIPE_EXIT_DURATION_MS,
  SNAP_BACK_DURATION_MS,
} from "../lib/constants";
import type { Restaurant } from "../lib/types";

/** Owns drag/swipe gesture state for the current top card (touch + mouse). */
export function useSwipeGesture(
  current: Restaurant | undefined,
  loading: boolean,
  onSwipe: (restaurantId: string, direction: "LIKE" | "DISLIKE") => void
) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [cardDragOffset, setCardDragOffset] = useState(0);
  const [swipeExit, setSwipeExit] = useState<"LIKE" | "DISLIKE" | null>(null);
  // Tracks the card id these three state values were last reset for. Deliberately
  // useState, not useRef: React's documented "adjust state when a prop changes"
  // pattern allows calling setState during render for exactly this case, but
  // mutating a *ref* during render is a separate, still-disallowed thing --
  // using useState here is what makes the block below legal.
  const [resetForCardId, setResetForCardId] = useState(current?.id);

  const photoScrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const gestureLockRef = useRef<"card" | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchInPhotoAreaRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const cardIdRef = useRef<string | null>(null);

  const applyCardTransform = useCallback((dx: number) => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = "none";
    cardRef.current.style.transform = `translateX(${dx}px) rotate(${dx * DRAG_ROTATION_FACTOR}deg)`;
  }, []);

  // Reset in-progress gesture state for the new top card. State resets happen
  // right here during render (React-sanctioned for "reset state when a prop
  // changes"); ref resets can't join them here (refs can't be mutated during
  // render) so they stay in the effect below instead.
  if (resetForCardId !== current?.id) {
    setResetForCardId(current?.id);
    setPhotoIndex(0);
    setCardDragOffset(0);
    setSwipeExit(null);
  }

  useEffect(() => {
    gestureLockRef.current = null;
    touchStartRef.current = null;
    cardIdRef.current = null;
  }, [current?.id]);

  const handlePhotoScroll = useCallback(() => {
    const el = photoScrollRef.current;
    if (!el) return;
    setPhotoIndex(Math.min(Math.round(el.scrollLeft / el.clientWidth), (current?.photoNames?.length ?? 1) - 1));
  }, [current?.photoNames?.length]);

  const goToPhoto = useCallback((index: number) => {
    const el = photoScrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
    setPhotoIndex(index);
  }, []);

  const applySwipeResult = useCallback(
    (restaurantId: string, direction: "LIKE" | "DISLIKE") => {
      if (!current || loading) return;
      setSwipeExit(direction);
      setTimeout(() => {
        onSwipe(restaurantId, direction);
        setSwipeExit(null);
        setCardDragOffset(0);
      }, SWIPE_EXIT_DURATION_MS);
    },
    [current, loading, onSwipe]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!current) return;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchInPhotoAreaRef.current = photoScrollRef.current?.contains(e.target as Node) ?? false;
      gestureLockRef.current = null;
    },
    [current]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || !current) return;
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      if (gestureLockRef.current === null) {
        if (Math.abs(dx) > GESTURE_LOCK_THRESHOLD || Math.abs(dy) > GESTURE_LOCK_THRESHOLD) {
          const horizontal = Math.abs(dx) >= Math.abs(dy);
          gestureLockRef.current = horizontal && !touchInPhotoAreaRef.current ? "card" : null;
        }
      }
      if (gestureLockRef.current === "card") {
        e.preventDefault();
        if (!cardIdRef.current && current) cardIdRef.current = current.id;
        dragOffsetRef.current = dx;
        setCardDragOffset(dx);
        applyCardTransform(dx);
      }
    },
    [current, applyCardTransform]
  );

  // Touch-end and mouse-up commit the same in-progress drag the same way --
  // neither reads anything from its triggering event, so one handler serves
  // both instead of maintaining two copies of this logic in lockstep.
  const commitDrag = useCallback(() => {
    if (gestureLockRef.current !== "card") { touchStartRef.current = null; return; }
    const offset = dragOffsetRef.current;
    const id = cardIdRef.current;
    dragOffsetRef.current = 0;
    cardIdRef.current = null;
    setCardDragOffset(0);
    touchStartRef.current = null;
    gestureLockRef.current = null;
    if (cardRef.current) {
      if (id && offset >= SWIPE_THRESHOLD) {
        cardRef.current.style.transition = "transform 0.2s ease-out";
        cardRef.current.style.transform = `translateX(${SWIPE_EXIT_DISTANCE_PERCENT}%) rotate(${SWIPE_EXIT_ROTATION_DEG}deg)`;
        applySwipeResult(id, "LIKE");
      } else if (id && offset <= -SWIPE_THRESHOLD) {
        cardRef.current.style.transition = "transform 0.2s ease-out";
        cardRef.current.style.transform = `translateX(-${SWIPE_EXIT_DISTANCE_PERCENT}%) rotate(-${SWIPE_EXIT_ROTATION_DEG}deg)`;
        applySwipeResult(id, "DISLIKE");
      } else {
        cardRef.current.style.transition = "transform 0.25s ease-out";
        cardRef.current.style.transform = "translateX(0) rotate(0)";
        const el = cardRef.current;
        setTimeout(() => { el.style.transform = ""; el.style.transition = ""; }, SNAP_BACK_DURATION_MS);
      }
    } else {
      if (id && offset >= SWIPE_THRESHOLD) applySwipeResult(id, "LIKE");
      else if (id && offset <= -SWIPE_THRESHOLD) applySwipeResult(id, "DISLIKE");
    }
  }, [applySwipeResult]);

  const handleTouchEnd = commitDrag;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!current || e.button !== 0) return;
      e.preventDefault();
      touchStartRef.current = { x: e.clientX, y: e.clientY };
      touchInPhotoAreaRef.current = photoScrollRef.current?.contains(e.target as Node) ?? false;
      gestureLockRef.current = null;
    },
    [current]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!touchStartRef.current || !current) return;
      const dx = e.clientX - touchStartRef.current.x;
      const dy = e.clientY - touchStartRef.current.y;
      if (gestureLockRef.current === null) {
        if (Math.abs(dx) > GESTURE_LOCK_THRESHOLD || Math.abs(dy) > GESTURE_LOCK_THRESHOLD) {
          gestureLockRef.current = Math.abs(dx) >= Math.abs(dy) && !touchInPhotoAreaRef.current ? "card" : null;
        }
      }
      if (gestureLockRef.current === "card") {
        if (!cardIdRef.current && current) cardIdRef.current = current.id;
        dragOffsetRef.current = dx;
        setCardDragOffset(dx);
        applyCardTransform(dx);
      }
    },
    [current, applyCardTransform]
  );

  const handleMouseUp = commitDrag;

  useEffect(() => {
    if (!current) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [current, handleMouseMove, handleMouseUp]);

  return {
    photoIndex,
    cardDragOffset,
    swipeExit,
    photoScrollRef,
    cardRef,
    handlePhotoScroll,
    goToPhoto,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMouseDown,
    applySwipeResult,
  };
}
