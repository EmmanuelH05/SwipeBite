"use client";

import { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
  error?: string;
};

export default function Input({ className = "", error, ...props }: InputProps) {
  return (
    <div className="w-full">
      <input
        className={`
          w-full rounded-lg border bg-[#141419] px-4 py-3 text-[#f0f0f5] text-sm
          placeholder:text-[#55556a]
          transition-all duration-200 ease-out
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error
            ? "border-[#f87171]/50 focus:border-[#f87171] focus:ring-1 focus:ring-[#f87171]/30"
            : "border-[#2a2a3a] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 hover:border-[#3a3a4a]"
          }
          focus:outline-none
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-xs text-[#f87171] animate-fade-in">{error}</p>
      )}
    </div>
  );
}
