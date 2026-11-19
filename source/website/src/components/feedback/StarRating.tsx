"use client";

import { useId, useState } from "react";

export const STAR_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.45l-5.8 3.05 1.1-6.47-4.7-4.58 6.5-.95z" />
    </svg>
  );
}

/**
 * Stars as a native radio group: Tab reaches it, the arrow keys change the score,
 * and screen readers hear "4 stars, Very good". `size="lg"` for the overall score.
 */
export default function StarRating({
  label,
  value,
  onChange,
  size = "lg",
  hint,
  error,
  errorId,
}: {
  label: string;
  value: number; // 0 = not rated
  onChange: (v: number) => void;
  size?: "lg" | "sm";
  hint?: string;
  error?: string;
  errorId?: string;
}) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset
      className={`fb-rate fb-rate-${size}`}
      aria-describedby={error && errorId ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="fb-rate-legend">
        {label}
        {hint && <span className="fb-rate-hint"> {hint}</span>}
      </legend>
      <div className="fb-rate-row">
        <div className="fb-stars" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={`fb-star${shown >= n ? " is-on" : ""}`} onMouseEnter={() => setHover(n)}>
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
                aria-label={`${n} ${n === 1 ? "star" : "stars"}, ${STAR_WORDS[n]}`}
              />
              <StarIcon />
            </label>
          ))}
        </div>
        <span className={`fb-rate-word${shown ? " is-set" : ""}`} aria-hidden="true">
          {shown ? STAR_WORDS[shown] : size === "lg" ? "Tap a star" : ""}
        </span>
        {size === "sm" && value > 0 && (
          <button type="button" className="fb-clear" onClick={() => onChange(0)} aria-label={`Clear the ${label} rating`}>
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}
