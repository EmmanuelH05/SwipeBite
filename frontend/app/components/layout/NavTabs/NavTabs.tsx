"use client";

import { motion } from "framer-motion";
import styles from "./NavTabs.module.css";

type View = "feed" | "matches";

type NavTabsProps = {
  view: View;
  matchesCount: number;
  onViewChange: (view: View) => void;
};

const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
  {
    id: "feed",
    label: "Discover",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    id: "matches",
    label: "Saved",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
];

export default function NavTabs({ view, matchesCount, onViewChange }: NavTabsProps) {
  return (
    <nav aria-label="Main navigation" className={styles.nav}>
      {tabs.map((tab) => {
        const isActive = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${isActive ? styles.active : ""}`}
            onClick={() => onViewChange(tab.id)}
          >
            {isActive && (
              <motion.span
                layoutId="navPill"
                className={styles.pill}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className={styles.tabInner}>
              {tab.icon}
              {tab.label}
              {tab.id === "matches" && matchesCount > 0 && (
                <motion.span
                  key={matchesCount}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={styles.badge}
                >
                  {matchesCount}
                </motion.span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
