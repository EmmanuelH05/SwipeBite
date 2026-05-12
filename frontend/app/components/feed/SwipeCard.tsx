"use client";

import { forwardRef } from "react";
import { getPhotoUrl } from "../../lib/utils";
import RestaurantCardContent from "../restaurant/RestaurantCardContent";
import type { Restaurant } from "../../lib/types";

export type SwipeCardProps = {
  restaurant: Restaurant;
  photoIndex: number;
  photoScrollRef: React.RefObject<HTMLDivElement | null>;
  onPhotoScroll: () => void;
  goToPhoto: (index: number) => void;
  style?: React.CSSProperties;
  dragOffset?: number;
  onPass: () => void;
  onLike: () => void;
  disabled?: boolean;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
};

const SwipeCard = forwardRef<HTMLDivElement, SwipeCardProps>(function SwipeCard(
  {
    restaurant,
    photoIndex,
    photoScrollRef,
    onPhotoScroll,
    goToPhoto,
    style,
    dragOffset = 0,
    onPass,
    onLike,
    disabled = false,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
  },
  ref
) {
  const photoNames = restaurant.photoNames ?? [];
  const hasMultiplePhotos = photoNames.length > 1;
  const score = restaurant.score;

  const OVERLAY_START = 30;
  const OVERLAY_FULL = 110;
  const likeOpacity = dragOffset > OVERLAY_START
    ? Math.min(1, (dragOffset - OVERLAY_START) / (OVERLAY_FULL - OVERLAY_START))
    : 0;
  const nopeOpacity = dragOffset < -OVERLAY_START
    ? Math.min(1, (-dragOffset - OVERLAY_START) / (OVERLAY_FULL - OVERLAY_START))
    : 0;

  return (
    <div
      ref={ref}
      className="relative z-10 overflow-hidden rounded-2xl border border-[#2a2a3a] bg-[#141419] shadow-[0_8px_48px_rgba(0,0,0,0.4)] animate-slide-in cursor-grab active:cursor-grabbing"
      style={{ ...style, willChange: "transform" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      {/* Photo area */}
      <div className="relative aspect-[4/3] min-h-[200px] overflow-hidden bg-[#0e0e14]">
        {photoNames.length > 0 ? (
          <div
            ref={photoScrollRef}
            className="flex h-full min-h-[200px] snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            onScroll={onPhotoScroll}
          >
            {photoNames.map((name, i) => (
              <img
                key={name}
                src={getPhotoUrl(name)}
                alt={`${restaurant.name} - Photo ${i + 1}`}
                className="h-full w-full shrink-0 snap-start object-cover"
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full min-h-[200px] items-center justify-center bg-[#0e0e14]">
            <span className="text-[#33334a] text-sm">No photos</span>
          </div>
        )}

        {/* Deep gradient overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#141419] via-[#141419]/60 to-transparent" />

        {/* Score badge */}
        {score && score.total > 0 && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1.5 border border-white/10 shadow-lg">
            <div className={`h-1.5 w-1.5 rounded-full ${score.total >= 70 ? "bg-[#34d399]" : score.total >= 50 ? "bg-indigo-400" : "bg-[#8888a0]"}`} />
            <span className="text-[11px] font-semibold text-white/90">{Math.round(score.total)}% match</span>
          </div>
        )}

        {/* LIKE overlay */}
        {likeOpacity > 0 && (
          <div
            className="pointer-events-none absolute left-4 top-6 swipe-label-like"
            style={{ opacity: likeOpacity }}
          >
            <div className="rounded-xl border-[3px] border-[#34d399] px-4 py-1.5 shadow-[0_0_24px_rgba(52,211,153,0.3)]">
              <span className="text-2xl font-black uppercase tracking-widest text-[#34d399]">LIKE</span>
            </div>
          </div>
        )}

        {/* NOPE overlay */}
        {nopeOpacity > 0 && (
          <div
            className="pointer-events-none absolute right-4 top-6 swipe-label-nope"
            style={{ opacity: nopeOpacity }}
          >
            <div className="rounded-xl border-[3px] border-[#f87171] px-4 py-1.5 shadow-[0_0_24px_rgba(248,113,113,0.3)]">
              <span className="text-2xl font-black uppercase tracking-widest text-[#f87171]">NOPE</span>
            </div>
          </div>
        )}

        {/* Photo dots (overlaid at the bottom of photo area) */}
        {hasMultiplePhotos && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5 pointer-events-auto">
            {photoNames.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`rounded-full transition-all duration-200 shadow-sm ${
                  i === photoIndex
                    ? "h-1.5 w-5 bg-white"
                    : "h-1.5 w-1.5 bg-white/40 hover:bg-white/60"
                }`}
                aria-label={`Photo ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  goToPhoto(i);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <RestaurantCardContent restaurant={restaurant} />

      {/* "Why This Restaurant?" explanation */}
      {score?.explanation && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl bg-indigo-500/5 border border-indigo-500/15 px-3.5 py-3">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h1.25v4.5h1.5V7H10v-.75H6.5V7z" />
          </svg>
          <p className="text-[11px] leading-relaxed text-indigo-300/80">{score.explanation}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 px-5 pb-6 pt-1">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-[#f87171]/30 bg-transparent py-3.5 text-sm font-semibold text-[#f87171] transition-all duration-200 hover:bg-[#f87171]/10 hover:border-[#f87171]/50 hover:shadow-[0_0_20px_rgba(248,113,113,0.2)] active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onPass}
          disabled={disabled}
          aria-label="Pass"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Pass
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-[#34d399]/30 bg-[#34d399]/8 py-3.5 text-sm font-semibold text-[#34d399] transition-all duration-200 hover:bg-[#34d399]/15 hover:border-[#34d399]/50 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)] active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onLike}
          disabled={disabled}
          aria-label="Like"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          Like
        </button>
      </div>
    </div>
  );
});

export default SwipeCard;
