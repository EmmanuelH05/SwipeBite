"use client";

import { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

type BadgeVariant = "default" | "success" | "accent" | "outline" | "warm";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export default function Badge({ variant = "default", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`${styles.badge} ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
