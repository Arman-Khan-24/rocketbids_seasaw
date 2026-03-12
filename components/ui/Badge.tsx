"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "gold" | "teal" | "danger" | "muted";
  className?: string;
}

const variantStyles = {
  gold: "bg-rocket-gold/15 text-rocket-gold border-rocket-gold/30",
  teal: "bg-rocket-teal/15 text-rocket-teal border-rocket-teal/30",
  danger: "bg-rocket-danger/15 text-rocket-danger border-rocket-danger/30",
  muted: "bg-rocket-dim/15 text-rocket-muted border-rocket-dim/30",
};

export function Badge({
  children,
  variant = "gold",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
