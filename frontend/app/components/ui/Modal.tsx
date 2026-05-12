"use client";

import { ReactNode, useEffect } from "react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  className = "",
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onClose}
    >
      <div
        className={`
          w-full max-w-md rounded-xl bg-[#141419] border border-[#2a2a3a] p-6
          shadow-[0_0_60px_rgba(0,0,0,0.5)]
          animate-slide-in
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" className="text-lg font-semibold text-[#f0f0f5]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-[#8888a0]">{subtitle}</p>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
