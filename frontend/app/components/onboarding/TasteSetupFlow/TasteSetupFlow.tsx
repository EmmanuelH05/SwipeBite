"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./TasteSetupFlow.module.css";

type TasteSetupFlowProps = {
  onComplete: (cuisines: string[], priceLevel: string) => Promise<void>;
  onSkip: () => void;
};

const CUISINES = [
  { id: "asian",         label: "Asian",        emoji: "🍜" },
  { id: "italian",       label: "Italian",       emoji: "🍕" },
  { id: "american",      label: "American",      emoji: "🍔" },
  { id: "mexican",       label: "Mexican",       emoji: "🌮" },
  { id: "indian",        label: "Indian",        emoji: "🍛" },
  { id: "mediterranean", label: "Mediter.",      emoji: "🥙" },
  { id: "seafood",       label: "Seafood",       emoji: "🦞" },
  { id: "european",      label: "European",      emoji: "🥐" },
  { id: "cafe",          label: "Café",          emoji: "☕" },
  { id: "dessert",       label: "Dessert",       emoji: "🍦" },
  { id: "fastfood",      label: "Fast Food",     emoji: "🥪" },
];

const PRICES = [
  { id: "$",   label: "$",   desc: "Budget eats" },
  { id: "$$",  label: "$$",  desc: "Mid-range" },
  { id: "$$$", label: "$$$", desc: "Fine dining" },
];

export default function TasteSetupFlow({ onComplete, onSkip }: TasteSetupFlowProps) {
  const [step, setStep]               = useState<"cuisines" | "price">("cuisines");
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(new Set());
  const [selectedPrice, setSelectedPrice]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);

  const toggleCuisine = (id: string) => {
    setSelectedCuisines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleFinish = async () => {
    if (!selectedPrice) return;
    setLoading(true);
    await onComplete([...selectedCuisines], selectedPrice);
    setLoading(false);
  };

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className={styles.panel}>
        <button type="button" className={styles.skipBtn} onClick={onSkip}>
          Skip
        </button>

        <AnimatePresence mode="wait">
          {step === "cuisines" ? (
            <motion.div
              key="cuisines"
              className={styles.screen}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>What do you love?</h1>
                <p className={styles.sub}>Pick everything that looks good</p>
              </div>

              <div className={styles.grid}>
                {CUISINES.map((c) => {
                  const active = selectedCuisines.has(c.id);
                  return (
                    <motion.button
                      key={c.id}
                      type="button"
                      className={`${styles.tile} ${active ? styles.tileActive : ""}`}
                      onClick={() => toggleCuisine(c.id)}
                      whileTap={{ scale: 0.91 }}
                      animate={active ? { scale: [1, 1.07, 1] } : { scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    >
                      <span className={styles.tileEmoji}>{c.emoji}</span>
                      <span className={styles.tileLabel}>{c.label}</span>
                      {active && (
                        <motion.div
                          className={styles.tileCheck}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 20 }}
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="price"
              className={styles.screen}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>Your price range?</h1>
                <p className={styles.sub}>We&apos;ll find spots that fit your budget</p>
              </div>

              <div className={styles.priceList}>
                {PRICES.map((p) => {
                  const active = selectedPrice === p.id;
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      className={`${styles.priceBtn} ${active ? styles.priceBtnActive : ""}`}
                      onClick={() => setSelectedPrice(p.id)}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className={styles.priceLabel}>{p.label}</span>
                      <span className={styles.priceDesc}>{p.desc}</span>
                      {active && (
                        <motion.div
                          className={styles.priceCheck}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 20 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer stays pinned below the scrollable content */}
        <div className={styles.footer}>
          {step === "price" && (
            <button type="button" className={styles.backBtn} onClick={() => setStep("cuisines")}>
              ← Back
            </button>
          )}
          <motion.button
            type="button"
            className={styles.ctaBtn}
            onClick={step === "cuisines" ? () => selectedCuisines.size > 0 && setStep("price") : handleFinish}
            disabled={step === "cuisines" ? selectedCuisines.size === 0 : !selectedPrice || loading}
            whileTap={{ scale: 0.97 }}
          >
            {step === "cuisines" ? "Next →" : loading ? "Saving…" : "Let's eat →"}
          </motion.button>
          {step === "cuisines" && selectedCuisines.size > 0 && (
            <motion.p
              className={styles.count}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {selectedCuisines.size} selected
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
