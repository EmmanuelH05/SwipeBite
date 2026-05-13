"use client";

import { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Input.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export default function Input({ error, leftIcon, rightIcon, className = "", ...props }: InputProps) {
  const inputClass = [
    styles.input,
    leftIcon ? styles.hasLeft : "",
    rightIcon ? styles.hasRight : "",
    error ? styles.error : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.wrapper}>
      <div className={styles.field}>
        {leftIcon && <span className={styles.iconLeft}>{leftIcon}</span>}
        <input className={inputClass} {...props} />
        {rightIcon && <span className={styles.iconRight}>{rightIcon}</span>}
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
