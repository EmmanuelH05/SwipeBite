"use client";

import { getPhotoUrl } from "../../../lib/utils";
import type { Restaurant } from "../../../lib/types";
import styles from "./CardBack.module.css";

type CardBackProps = {
  restaurant: Restaurant;
};

export default function CardBack({ restaurant }: CardBackProps) {
  const firstPhoto = restaurant.photoNames?.[0];

  return (
    <div className={styles.cardBack} aria-hidden>
      {firstPhoto ? (
        <img src={getPhotoUrl(firstPhoto)} alt="" className={styles.photo} />
      ) : (
        <div className={styles.placeholder} />
      )}
    </div>
  );
}
