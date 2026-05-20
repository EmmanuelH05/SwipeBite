"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { getPhotoUrl } from "../../../lib/utils";
import type { Restaurant, ScoreBreakdown } from "../../../lib/types";
import styles from "./MatchReveal.module.css";

type MatchRevealProps = {
  restaurant: Restaurant;
  score: ScoreBreakdown;
  onDismiss: () => void;
};

export default function MatchReveal({ restaurant, score, onDismiss }: MatchRevealProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 1200);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const photo = restaurant.photoNames?.[0];
  const pct   = Math.round(score.total);
  const tier  = pct >= 70 ? "high" : pct >= 50 ? "mid" : "low";

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={onDismiss}
    >
      {/* Background photo */}
      {photo ? (
        <img src={getPhotoUrl(photo)} alt="" className={styles.bg} draggable={false} />
      ) : (
        <div className={styles.bgFallback} />
      )}
      <div className={styles.scrim} />

      {/* Content */}
      <div className={styles.content}>
        <motion.div
          className={`${styles.scoreBadge} ${styles[tier]}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.05 }}
        >
          <span className={styles.scoreNumber}>{pct}%</span>
          <span className={styles.scoreWord}>match</span>
        </motion.div>

        {score.explanation && (
          <motion.p
            className={styles.explanation}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.14 }}
          >
            {score.explanation}
          </motion.p>
        )}

        <motion.p
          className={styles.hint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          tap to continue
        </motion.p>
      </div>
    </motion.div>
  );
}
