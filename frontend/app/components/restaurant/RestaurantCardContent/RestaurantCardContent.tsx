"use client";

import { formatCuisine } from "../../../lib/utils";
import type { Restaurant } from "../../../lib/types";
import Badge from "../../ui/Badge/Badge";
import styles from "./RestaurantCardContent.module.css";

type RestaurantCardContentProps = {
  restaurant: Restaurant;
  compact?: boolean;
};

export default function RestaurantCardContent({ restaurant, compact = false }: RestaurantCardContentProps) {
  const { name, cuisine, priceLevel, address, phone, openingHours } = restaurant;

  return (
    <div className={compact ? styles.compact : styles.full}>
      <h2 className={`${styles.name} ${compact ? styles.sm : styles.lg}`}>{name}</h2>

      <div className={styles.badges}>
        <Badge variant="accent">{formatCuisine(cuisine ?? "Restaurant")}</Badge>
        <Badge variant="default">{priceLevel}</Badge>
      </div>

      {!compact && (
        <>
          {address && <p className={styles.address}>{address}</p>}
          {phone && (
            <p className={styles.phone}>
              <a href={`tel:${phone}`} className={styles.phoneLink}>{phone}</a>
            </p>
          )}
          {openingHours && (
            <div className={styles.hours}>
              <p className={styles.hoursLabel}>Hours</p>
              <pre className={styles.hoursPre}>{openingHours}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
