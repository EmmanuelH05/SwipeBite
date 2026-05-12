"use client";

import Logo from "./Logo";

type HeaderProps = {
  onLogout: () => void;
};

export default function Header({ onLogout }: HeaderProps) {
  return (
    <header className="mb-5 flex items-center justify-between">
      <h1 className="m-0">
        <Logo size="header" animate={false} />
      </h1>
      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-[#55556a] transition-all duration-200 hover:border-[#f87171]/20 hover:bg-[#f87171]/5 hover:text-[#f87171]"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign out
      </button>
    </header>
  );
}
