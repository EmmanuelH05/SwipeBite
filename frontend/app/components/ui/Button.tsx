"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "pass" | "like" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  className?: string;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-indigo-500 text-white border border-indigo-500/50 hover:bg-indigo-400 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] active:scale-[0.97]",
  secondary:
    "bg-[#1a1a22] text-[#f0f0f5] border border-[#2a2a3a] hover:bg-[#22222e] hover:border-[#3a3a4a] active:scale-[0.97]",
  outline:
    "bg-transparent text-[#8888a0] border border-[#2a2a3a] hover:text-[#f0f0f5] hover:border-[#4a4a5a] hover:bg-[#141419] active:scale-[0.97]",
  ghost:
    "bg-transparent text-[#8888a0] hover:text-[#f0f0f5] hover:bg-[#1a1a22] active:scale-[0.97]",
  pass:
    "bg-transparent text-[#f87171] border border-[#f87171]/30 hover:bg-[#f87171]/10 hover:border-[#f87171]/50 hover:shadow-[0_0_16px_rgba(248,113,113,0.15)] active:scale-[0.97]",
  like:
    "bg-[#34d399]/10 text-[#34d399] border border-[#34d399]/30 hover:bg-[#34d399]/20 hover:border-[#34d399]/50 hover:shadow-[0_0_16px_rgba(52,211,153,0.15)] active:scale-[0.97]",
  danger:
    "bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/30 hover:bg-[#f87171]/20 active:scale-[0.97]",
};

export default function Button({
  variant = "primary",
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium
        transition-all duration-200 ease-out
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500
        ${variants[variant]}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
