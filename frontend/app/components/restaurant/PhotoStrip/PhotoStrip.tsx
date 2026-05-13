"use client";

import { getPhotoUrl } from "../../../lib/utils";
import type { Restaurant } from "../../../lib/types";
import styles from "./PhotoStrip.module.css";

type PhotoStripProps = {
  restaurant: Restaurant;
  maxPhotos?: number;
};

export default function PhotoStrip({ restaurant, maxPhotos = 4 }: PhotoStripProps) {
  const names = restaurant.photoNames?.slice(0, maxPhotos) ?? [];

  if (names.length === 0) {
    return (
      <div className={styles.placeholder}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div className={styles.thumb}>
      <img src={getPhotoUrl(names[0])} alt={restaurant.name} className={styles.img} />
    </div>
  );
}
