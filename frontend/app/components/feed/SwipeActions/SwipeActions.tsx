"use client";

import styles from "./SwipeActions.module.css";

type SwipeActionsProps = {
  onPass: () => void;
  onLike: () => void;
  disabled?: boolean;
};

export default function SwipeActions({ onPass, onLike, disabled }: SwipeActionsProps) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        onClick={onPass}
        disabled={disabled}
        aria-label="Pass"
        className={`${styles.btn} ${styles.btnPass}`}
      >
        <svg className={styles.icon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onLike}
        disabled={disabled}
        aria-label="Like"
        className={`${styles.btn} ${styles.btnLike}`}
      >
        <svg className={styles.icon} width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </button>

    </div>
  );
}
