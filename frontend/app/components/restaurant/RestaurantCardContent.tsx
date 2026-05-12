"use client";

import { formatCuisine } from "../../lib/utils";
import type { Restaurant } from "../../lib/types";
import Badge from "../ui/Badge";

type RestaurantCardContentProps = {
  restaurant: Restaurant;
  compact?: boolean;
};

export default function RestaurantCardContent({ restaurant, compact = false }: RestaurantCardContentProps) {
  const { name, cuisine, priceLevel, address, phone, openingHours } = restaurant;

  return (
    <div className={compact ? "space-y-1 p-4" : "space-y-3 px-6 py-5"}>
      <h2 className={`font-semibold tracking-tight text-[#f0f0f5] ${compact ? "text-base" : "text-xl"}`}>
        {name}
      </h2>

      <div className="flex items-center gap-2">
        <Badge variant="accent">{formatCuisine(cuisine ?? "Restaurant")}</Badge>
        <Badge variant="default">{priceLevel}</Badge>
      </div>

      {!compact && (
        <>
          {address && (
            <p className="text-sm text-[#8888a0] leading-relaxed">{address}</p>
          )}
          {phone && (
            <p className="text-sm text-[#8888a0]">
              <a
                href={`tel:${phone}`}
                className="text-indigo-400/80 hover:text-indigo-300 transition-colors"
              >
                {phone}
              </a>
            </p>
          )}
          {openingHours && (
            <div className="border-t border-[#1e1e2e] pt-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#55556a] mb-1.5">Hours</p>
              <pre className="whitespace-pre-wrap font-sans text-xs text-[#8888a0] leading-relaxed">
                {openingHours}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
