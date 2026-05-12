"use client";

import { motion } from "framer-motion";

type View = "feed" | "matches";

type NavTabsProps = {
  view: View;
  matchesCount: number;
  onViewChange: (view: View) => void;
};

const tabs: { id: View; label: string }[] = [
  { id: "feed", label: "Discover" },
  { id: "matches", label: "Matches" },
];

export default function NavTabs({ view, matchesCount, onViewChange }: NavTabsProps) {
  return (
    <nav className="relative mb-6 flex rounded-xl bg-[#0e0e14] border border-[#1e1e2e] p-1 gap-1">
      {tabs.map((tab) => {
        const isActive = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className="relative flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors duration-200 z-10"
            style={{ color: isActive ? "#a5b4fc" : "#55556a" }}
            onClick={() => onViewChange(tab.id)}
          >
            {isActive && (
              <motion.span
                layoutId="navPill"
                className="absolute inset-0 rounded-lg bg-indigo-500/12 border border-indigo-500/20 shadow-[0_0_16px_rgba(99,102,241,0.12)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5">
              {tab.label}
              {tab.id === "matches" && matchesCount > 0 && (
                <motion.span
                  key={matchesCount}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="inline-flex items-center justify-center rounded-full bg-indigo-500/25 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 min-w-[18px]"
                >
                  {matchesCount}
                </motion.span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
