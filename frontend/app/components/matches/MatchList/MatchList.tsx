"use client";

import { motion, AnimatePresence } from "framer-motion";
import MatchListItem from "../MatchListItem/MatchListItem";
import type { Match } from "../../../lib/types";
import styles from "./MatchList.module.css";

type MatchListProps = {
  matches: Match[];
  loading: boolean;
  onVisitClick: (match: Match) => void;
};

function SkeletonItem() {
  return (
    <div className={styles.skeletonItem}>
      <div className={`${styles.skeletonThumb} skeleton-pulse`} />
      <div className={styles.skeletonText}>
        <div className={`${styles.skeletonLine1} skeleton-pulse`} />
        <div className={`${styles.skeletonLine2} skeleton-pulse`} />
      </div>
      <div className={`${styles.skeletonBtn} skeleton-pulse`} />
    </div>
  );
}

export default function MatchList({ matches, loading, onVisitClick }: MatchListProps) {
  if (loading && matches.length === 0) {
    return (
      <div className={styles.skeletonList}>
        {[1, 2, 3].map((i) => <SkeletonItem key={i} />)}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <motion.div
        className={styles.empty}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className={styles.emptyIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </div>
        <p className={styles.emptyTitle}>No saved restaurants yet</p>
        <p className={styles.emptyHint}>Like restaurants in Discover to save them here</p>
      </motion.div>
    );
  }

  return (
    <ul className={styles.list}>
      <AnimatePresence>
        {matches.map((m, i) => (
          <motion.li
            key={m.restaurant.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
          >
            <MatchListItem match={m} onVisitClick={() => onVisitClick(m)} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
