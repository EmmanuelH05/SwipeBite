"use client";

import { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  className?: string;
  glow?: boolean;
};

export default function Card({ className = "", glow = false, children, ...props }: CardProps) {
  return (
    <div
      className={`
        overflow-hidden rounded-xl bg-[#141419] border border-[#2a2a3a]
        transition-all duration-300 ease-out
        ${glow ? "hover:shadow-[0_0_30px_rgba(99,102,241,0.08)] hover:border-[#3a3a4a]" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
