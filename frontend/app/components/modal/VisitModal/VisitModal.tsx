"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Button from "../../ui/Button/Button";
import type { Match } from "../../../lib/types";
import styles from "./VisitModal.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type VisitModalMode = "add" | "view" | "edit";

type VisitModalProps = {
  match: Match;
  mode: VisitModalMode;
  experience: string;
  notes: string;
  onExperienceChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onEdit: () => void;
};

const experienceOptions = [
  { value: "great",        label: "Great",  emoji: "🔥" },
  { value: "good",         label: "Good",   emoji: "😊" },
  { value: "okay",         label: "Okay",   emoji: "😐" },
  { value: "disappointing",label: "Meh",    emoji: "😒" },
];

export default function VisitModal({
  match, mode, experience, notes,
  onExperienceChange, onNotesChange, onClose, onSave, onEdit,
}: VisitModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the dialog on open and restore focus to whatever had it before
  // (the "Visit" button that opened this modal, typically) on close --
  // without this, focus silently stays on a now-hidden trigger element.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }

      // Trap Tab within the dialog -- without this, tabbing past the last
      // focusable element (or shift-tabbing past the first) moves focus to
      // whatever's behind the modal in the page, which a screen reader user
      // has no way to know is now hidden behind an open dialog.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const title =
    mode === "view" ? match.restaurant.name :
    mode === "edit" ? "Edit review" :
    `How was ${match.restaurant.name}?`;

  return (
    <motion.div
      className={styles.backdrop}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className={styles.overlay} />

      <motion.div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 id="visit-modal-title" className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>
          {mode === "view" ? "Your saved review" : "Share your experience"}
        </p>

        {mode === "view" ? (
          <>
            <div className={styles.viewBody}>
              {match.experience && (
                <div className={styles.experienceRow}>
                  <span className={styles.experienceEmoji}>
                    {experienceOptions.find((o) => o.value === match.experience)?.emoji ?? "⭐"}
                  </span>
                  <div>
                    <p className={styles.experienceLabel}>Experience</p>
                    <p className={styles.experienceValue}>
                      {match.experience.charAt(0).toUpperCase() + match.experience.slice(1)}
                    </p>
                  </div>
                </div>
              )}
              {match.notes && (
                <div>
                  <p className={styles.notesLabel}>Notes</p>
                  <p className={styles.notesText}>{match.notes}</p>
                </div>
              )}
              {!match.experience && !match.notes && (
                <p className={styles.noReview}>No review saved.</p>
              )}
            </div>
            <div className={styles.footer}>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button variant="outline" onClick={onEdit}>Edit review</Button>
            </div>
          </>
        ) : (
          <div className={styles.editBody}>
            <div>
              <p className={styles.sectionLabel}>How was it?</p>
              <div className={styles.ratingGrid}>
                {experienceOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onExperienceChange(opt.value)}
                    className={`${styles.ratingBtn} ${experience === opt.value ? styles.selected : ""}`}
                  >
                    <span className={styles.ratingEmoji}>{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={styles.sectionLabel}>Notes</p>
              <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="What stood out? Anything to remember?"
                className={styles.notesInput}
                rows={3}
              />
            </div>

            <div className={styles.footer}>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={onSave}>
                {mode === "edit" ? "Update review" : "Save review"}
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
