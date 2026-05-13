"use client";

import { ReactNode, useEffect } from "react";
import styles from "./Modal.module.css";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export default function Modal({ isOpen, onClose, title, subtitle, children, className = "" }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onClose}
    >
      <div
        className={`${styles.panel} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
