"use client";

import { HTMLAttributes } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "accent" | "outline";
  className?: string;
};

const variants = {
  default: "bg-[#1a1a22] text-[#8888a0] border border-[#2a2a3a]",
  success: "bg-[#34d399]/10 text-[#34d399] border border-[#34d399]/20",
  accent: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  outline: "bg-transparent text-[#8888a0] border border-[#2a2a3a]",
};

export default function Badge({
  variant = "default",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium
        transition-all duration-200
        ${variants[variant]}
        ${className}
      `}
      {...props}
    />
  );
}
