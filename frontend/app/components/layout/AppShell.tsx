"use client";

import { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  className?: string;
};

export default function AppShell({ children, className = "" }: AppShellProps) {
  return (
    <div className={`relative flex min-h-screen items-start justify-center overflow-hidden bg-[#08080d] px-4 py-6 sm:items-center sm:p-6 ${className}`}>
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-indigo-600/6 blur-3xl" />
        <div className="absolute -right-32 bottom-1/4 h-80 w-80 rounded-full bg-cyan-500/4 blur-3xl" />
      </div>
      <main className="relative z-10 w-full max-w-md rounded-2xl border border-[#1e1e2e] bg-[#0e0e14]/98 p-5 shadow-[0_0_80px_rgba(0,0,0,0.5)] sm:p-6">
        {children}
      </main>
    </div>
  );
}
