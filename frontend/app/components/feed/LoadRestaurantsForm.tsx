"use client";

import Button from "../ui/Button";
import Input from "../ui/Input";

type LoadRestaurantsFormProps = {
  location: string;
  loading: boolean;
  onLocationChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export default function LoadRestaurantsForm({
  location,
  loading,
  onLocationChange,
  onSubmit,
}: LoadRestaurantsFormProps) {
  return (
    <form onSubmit={onSubmit} className="mb-5 flex w-full gap-2">
      <div className="relative flex-1">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#33334a]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <Input
          type="text"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder="City or neighborhood..."
          disabled={loading}
          className="pl-10"
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        disabled={loading}
        className="shrink-0 px-5"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading
          </span>
        ) : (
          "Search"
        )}
      </Button>
    </form>
  );
}
