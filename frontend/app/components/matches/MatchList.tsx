"use client";

import { motion, AnimatePresence } from "framer-motion";
import MatchListItem from "./MatchListItem";
import type { Match } from "../../lib/types";

type MatchListProps = {
  matches: Match[];
  loading: boolean;
  onVisitClick: (match: Match) => void;
};

export default function MatchList({ matches, loading, onVisitClick }: MatchListProps) {
  if (loading && matches.length === 0) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl p-4 border border-[#1e1e2e] bg-[#141419]">
            <div className="h-[56px] w-[56px] shrink-0 rounded-xl skeleton-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded skeleton-pulse" />
              <div className="h-3 w-48 rounded skeleton-pulse" />
            </div>
            <div className="h-7 w-20 rounded-lg skeleton-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center py-16"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#141419] border border-[#2a2a3a]">
          <svg className="h-7 w-7 text-[#33334a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[#55556a]">No matches yet</p>
        <p className="mt-1 text-xs text-[#33334a]">Swipe right on restaurants you love</p>
      </motion.div>
    );
  }

  return (
    <ul className="m-0 list-none space-y-2 p-0">
      <AnimatePresence>
        {matches.map((m, i) => (
          <motion.li
            key={m.restaurant.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.28, delay: i * 0.05 }}
          >
            <MatchListItem
              match={m}
              onVisitClick={() => onVisitClick(m)}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
