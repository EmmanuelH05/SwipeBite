"use client";

import CardBack from "./CardBack";
import SwipeCard from "./SwipeCard";
import type { Restaurant } from "../../lib/types";
import type { SwipeCardProps } from "./SwipeCard";

type CardStackProps = {
  current: Restaurant;
  next: Restaurant | null;
  swipeCardProps: Omit<SwipeCardProps, "restaurant">;
  cardRef: React.RefObject<HTMLDivElement | null>;
};

export default function CardStack({ current, next, swipeCardProps, cardRef }: CardStackProps) {
  return (
    <div className="relative min-h-[320px] w-full">
      {next && <CardBack restaurant={next} />}
      <SwipeCard ref={cardRef} restaurant={current} {...swipeCardProps} />
    </div>
  );
}
