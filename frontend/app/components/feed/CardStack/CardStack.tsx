"use client";

import CardBack from "../CardBack/CardBack";
import SwipeCard from "../SwipeCard/SwipeCard";
import SwipeActions from "../SwipeActions/SwipeActions";
import type { Restaurant } from "../../../lib/types";
import type { SwipeCardProps } from "../SwipeCard/SwipeCard";
import styles from "./CardStack.module.css";

type CardStackProps = {
  current: Restaurant;
  next: Restaurant | null;
  swipeCardProps: Omit<SwipeCardProps, "restaurant">;
  cardRef: React.RefObject<HTMLDivElement | null>;
};

export default function CardStack({ current, next, swipeCardProps, cardRef }: CardStackProps) {
  const { onPass, onLike, disabled } = swipeCardProps;

  return (
    <div className={styles.stack}>
      <div className={styles.cardArea}>
        {next && <CardBack restaurant={next} />}
        <SwipeCard key={current.id} ref={cardRef} restaurant={current} {...swipeCardProps} />
      </div>
      <SwipeActions onPass={onPass} onLike={onLike} disabled={disabled} />
    </div>
  );
}
