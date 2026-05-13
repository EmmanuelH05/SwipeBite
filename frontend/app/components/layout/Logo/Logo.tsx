"use client";

import styles from "./Logo.module.css";

type LogoProps = {
  size?: "auth" | "header";
  animate?: boolean;
};

export default function Logo({ size = "auth", animate = true }: LogoProps) {
  return (
    <div className={`${styles.logo} ${animate ? styles.animate : ""}`}>
      <div className={size === "auth" ? styles.iconAuth : styles.iconHeader}>
        <svg className="h-full w-full" viewBox="0 0 44 44" fill="none" aria-hidden>
          <circle cx="22" cy="22" r="20" fill="#f97316" opacity="0.12" />
          <circle cx="22" cy="22" r="20" stroke="#f97316" strokeWidth="1.5" opacity="0.5" />
          <line x1="14" y1="11" x2="14" y2="17" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="11" x2="17" y2="17" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
          <line x1="20" y1="11" x2="20" y2="17" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
          <path d="M17 17 Q17 21 17 23 L17 33" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
          <path d="M27 11 Q30 14 29.5 20 L29.5 33" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" />
          <path d="M27 11 Q24 15 26 20 L29.5 20" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className={`${styles.wordmark} ${size === "auth" ? styles.sizeAuth : styles.sizeHeader}`}>
        Swipe<span className={styles.accent}>Bite</span>
      </span>
    </div>
  );
}
