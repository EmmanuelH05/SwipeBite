"use client";

import { ReactNode } from "react";
import styles from "./AppShell.module.css";

type AppShellProps = {
  children: ReactNode;
  className?: string;
};

export default function AppShell({ children, className = "" }: AppShellProps) {
  return (
    <div className={`${styles.page} ${className}`}>
      <div className={styles.glow}>
        <div className={styles.glowLeft} />
        <div className={styles.glowRight} />
      </div>
      <main className={styles.main}>
        <div className={styles.inner}>
          {children}
        </div>
      </main>
    </div>
  );
}
