"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "../ui/Button";
import type { Match } from "../../lib/types";

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
  { value: "great", label: "Great", emoji: "🔥" },
  { value: "good", label: "Good", emoji: "😊" },
  { value: "okay", label: "Okay", emoji: "😐" },
  { value: "disappointing", label: "Meh", emoji: "😒" },
];

export default function VisitModal({
  match,
  mode,
  experience,
  notes,
  onExperienceChange,
  onNotesChange,
  onClose,
  onSave,
  onEdit,
}: VisitModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const title =
    mode === "view"
      ? match.restaurant.name
      : mode === "edit"
        ? `Edit review`
        : `How was ${match.restaurant.name}?`;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-modal-title"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

        <motion.div
          className="relative w-full max-w-md rounded-2xl border border-[#2a2a3a] bg-[#0e0e14] p-6 shadow-[0_0_80px_rgba(0,0,0,0.6)]"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-[#1a1a22] text-[#55556a] transition-colors hover:text-[#f0f0f5] hover:bg-[#2a2a3a]"
            aria-label="Close"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <h2 id="visit-modal-title" className="pr-8 text-lg font-semibold text-[#f0f0f5]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[#55556a]">
            {mode === "view" ? "Your saved review" : "Share your experience"}
          </p>

          {mode === "view" ? (
            <>
              <div className="mb-5 mt-5 space-y-4">
                {match.experience && (
                  <div className="flex items-center gap-3 rounded-xl bg-[#141419] border border-[#2a2a3a] px-4 py-3">
                    <span className="text-2xl">
                      {experienceOptions.find((o) => o.value === match.experience)?.emoji ?? "⭐"}
                    </span>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[#55556a]">Experience</p>
                      <p className="text-sm font-medium text-[#f0f0f5]">
                        {match.experience.charAt(0).toUpperCase() + match.experience.slice(1)}
                      </p>
                    </div>
                  </div>
                )}
                {match.notes && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#55556a] mb-1.5">Notes</p>
                    <p className="whitespace-pre-wrap rounded-xl bg-[#141419] border border-[#2a2a3a] px-4 py-3 text-sm text-[#8888a0] leading-relaxed">{match.notes}</p>
                  </div>
                )}
                {!match.experience && !match.notes && (
                  <p className="text-sm text-[#55556a]">No review saved.</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>Close</Button>
                <Button variant="outline" onClick={onEdit}>Edit review</Button>
              </div>
            </>
          ) : (
            <div className="mt-5 flex flex-col gap-5">
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#55556a]">How was it?</p>
                <div className="grid grid-cols-4 gap-2">
                  {experienceOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onExperienceChange(opt.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-all duration-200 ${
                        experience === opt.value
                          ? "border-indigo-500/50 bg-indigo-500/12 text-indigo-300 shadow-[0_0_16px_rgba(99,102,241,0.12)]"
                          : "border-[#2a2a3a] bg-[#141419] text-[#55556a] hover:text-[#8888a0] hover:border-[#3a3a4a] hover:bg-[#1a1a22]"
                      }`}
                    >
                      <span className="text-xl leading-none">{opt.emoji}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#55556a]">Notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="What stood out? Anything to remember?"
                  className="w-full min-h-[88px] resize-y rounded-xl border border-[#2a2a3a] bg-[#141419] px-4 py-3 text-sm text-[#f0f0f5] placeholder:text-[#33334a] focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200 leading-relaxed"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={onSave}>
                  {mode === "edit" ? "Update review" : "Save review"}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
