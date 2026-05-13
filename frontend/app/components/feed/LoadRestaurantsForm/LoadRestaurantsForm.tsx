"use client";

import Input from "../../ui/Input/Input";
import styles from "./LoadRestaurantsForm.module.css";

type LoadRestaurantsFormProps = {
  location: string;
  loading: boolean;
  onLocationChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
};

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export default function LoadRestaurantsForm({ location, loading, onLocationChange, onSubmit }: LoadRestaurantsFormProps) {
  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <div className={styles.inputWrap}>
        <Input
          type="text"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder="City or neighborhood..."
          disabled={loading}
          leftIcon={<SearchIcon />}
        />
      </div>

      <button type="submit" disabled={loading} className={styles.searchBtn}>
        {loading ? (
          <span className={styles.loadingInner}>
            <svg className={styles.spinner} viewBox="0 0 24 24" fill="none">
              <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading
          </span>
        ) : (
          "Search"
        )}
      </button>
    </form>
  );
}
