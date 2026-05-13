"use client";

import { forwardRef } from "react";
import { getPhotoUrl, formatCuisine } from "../../../lib/utils";
import type { Restaurant } from "../../../lib/types";
import styles from "./SwipeCard.module.css";

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

const OVERLAY_START = 30;
const OVERLAY_FULL  = 110;

const SwipeCard = forwardRef<HTMLDivElement, SwipeCardProps>(function SwipeCard(
  { restaurant, photoIndex, photoScrollRef, onPhotoScroll, goToPhoto, style, dragOffset = 0, disabled = false, onTouchStart, onTouchMove, onTouchEnd, onMouseDown },
  ref
) {
  const photoNames = restaurant.photoNames ?? [];
  const score = restaurant.score;

  const likeOpacity = dragOffset > OVERLAY_START
    ? Math.min(1, (dragOffset - OVERLAY_START) / (OVERLAY_FULL - OVERLAY_START)) : 0;
  const nopeOpacity = dragOffset < -OVERLAY_START
    ? Math.min(1, (-dragOffset - OVERLAY_START) / (OVERLAY_FULL - OVERLAY_START)) : 0;

  const scoreClass =
    score && score.total >= 70 ? styles.high : score && score.total >= 50 ? styles.mid : styles.low;

  return (
    <div
      ref={ref}
      className={styles.card}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      {/* Photos */}
      {photoNames.length > 0 ? (
        <div ref={photoScrollRef} className={styles.photoStrip} onScroll={onPhotoScroll}>
          {photoNames.map((name, i) => (
            <img
              key={name}
              src={getPhotoUrl(name)}
              alt=""
              className={styles.photo}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
            />
          ))}
        </div>
      ) : (
        <div className={styles.noPhoto}>
          <svg className={styles.noPhotoIcon} width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className={styles.noPhotoText}>No photo available</p>
        </div>
      )}

      {/* Nav dots — full width, no other elements at same row */}
      {photoNames.length > 1 && (
        <div className={styles.navDots}>
          {photoNames.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.dot} ${i === photoIndex ? styles.active : ""}`}
              aria-label={`Photo ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); goToPhoto(i); }}
            />
          ))}
        </div>
      )}

      {/* Gradient + info */}
      <div className={styles.gradient} />
      <div className={styles.info}>
        <div>
          <h2 className={styles.name}>{restaurant.name}</h2>
          <div className={styles.meta}>
            <span className={styles.chip}>{formatCuisine(restaurant.cuisine ?? "Restaurant")}</span>
            <span className={styles.chip}>{restaurant.priceLevel}</span>
            {score && score.total > 0 && (
              <span className={`${styles.scoreChip} ${scoreClass}`}>
                <span className={styles.scoreDotInline} />
                {Math.round(score.total)}% match
              </span>
            )}
            {restaurant.address && (
              <span className={styles.address}>{restaurant.address.split(",")[0]}</span>
            )}
          </div>
        </div>

        {score?.explanation && (
          <div className={styles.explanation}>
            <svg className={styles.explanationIcon} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h1.25v4.5h1.5V7H10v-.75H6.5V7z" />
            </svg>
            <p className={styles.explanationText}>{score.explanation}</p>
          </div>
        )}
      </div>

      {/* Swipe overlays */}
      {likeOpacity > 0 && (
        <div className={styles.likeOverlay} style={{ opacity: likeOpacity }}>
          <div className={styles.likeLabel}>LIKE</div>
        </div>
      )}
      {nopeOpacity > 0 && (
        <div className={styles.nopeOverlay} style={{ opacity: nopeOpacity }}>
          <div className={styles.nopeLabel}>NOPE</div>
        </div>
      )}

      {disabled && <div className={styles.disabledOverlay} />}
    </div>
  );
});

export default SwipeCard;
