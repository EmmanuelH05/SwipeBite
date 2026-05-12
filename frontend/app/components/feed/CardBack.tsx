"use client";

import { getPhotoUrl } from "../../lib/utils";
import RestaurantCardContent from "../restaurant/RestaurantCardContent";
import type { Restaurant } from "../../lib/types";

type CardBackProps = {
  restaurant: Restaurant;
};

export default function CardBack({ restaurant }: CardBackProps) {
  const firstPhoto = restaurant.photoNames?.[0];

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-2 z-0 origin-top scale-[0.96] overflow-hidden rounded-2xl border border-[#1e1e2e] bg-[#111117] opacity-50"
      aria-hidden
    >
      <div className="relative aspect-[4/3] min-h-[180px] overflow-hidden bg-[#0e0e14]">
        {firstPhoto ? (
          <img
            src={getPhotoUrl(firstPhoto)}
            alt=""
            className="h-full w-full object-cover brightness-50"
          />
        ) : (
          <div className="h-full w-full bg-[#0e0e14]" />
        )}
      </div>
      <RestaurantCardContent restaurant={restaurant} compact />
    </div>
  );
}
