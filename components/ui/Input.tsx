"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm text-rocket-muted">{label}</label>
        )}
        <input
          ref={ref}
          className={`w-full rounded-lg border border-rocket-border bg-rocket-card px-4 py-2.5 text-rocket-text placeholder:text-rocket-dim focus:border-rocket-gold focus:outline-none focus:ring-1 focus:ring-rocket-gold/50 transition-colors ${
            error ? "border-rocket-danger" : ""
          } ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-rocket-danger">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
