"use client";

import { HTMLAttributes } from "react";
import styles from "./Card.module.css";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  glow?: boolean;
};

export default function Card({ glow = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`${styles.card} ${glow ? styles.glow : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
