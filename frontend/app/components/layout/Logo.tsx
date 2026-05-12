"use client";

type LogoProps = {
  size?: "auth" | "header";
  animate?: boolean;
};

export default function Logo({ size = "auth", animate = true }: LogoProps) {
  return (
    <div
      className={`
        inline-flex items-center gap-3
        ${size === "auth" ? "mb-2" : ""}
        ${animate ? "animate-fade-in" : ""}
      `}
    >
      <div className={`flex shrink-0 ${size === "auth" ? "h-11 w-11" : "h-8 w-8"}`}>
        <svg
          className="h-full w-full"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <circle
            cx="20"
            cy="20"
            r="17"
            stroke="#6366f1"
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
          />
          <circle
            cx="20"
            cy="20"
            r="17"
            stroke="url(#logoGrad)"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="28" cy="12" r="5" fill="#6366f1" opacity="0.3" />
          <defs>
            <linearGradient id="logoGrad" x1="3" y1="3" x2="37" y2="37">
              <stop stopColor="#6366f1" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span
        className={`
          font-semibold tracking-tight text-[#f0f0f5]
          ${size === "auth" ? "text-3xl" : "text-xl"}
        `}
      >
        Swipe<span className="text-indigo-400">Bite</span>
      </span>
    </div>
  );
}
