"use client";

import Logo from "../Logo/Logo";
import styles from "./Header.module.css";

type HeaderProps = {
  onLogout: () => void;
  userName?: string;
};

export default function Header({ onLogout, userName }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.logoBlock}>
        <Logo size="header" animate={false} />
        {userName && (
          <p className={styles.greeting}>Hey, {userName.split(" ")[0]}</p>
        )}
      </div>

      <button type="button" onClick={onLogout} className={styles.logoutBtn}>
        <svg
          className={styles.logoutIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign out
      </button>
    </header>
  );
}
