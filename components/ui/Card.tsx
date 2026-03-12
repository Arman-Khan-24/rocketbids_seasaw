"use client";

import { motion } from "framer-motion";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  war?: boolean;
}

export function Card({ children, className = "", war = false }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-rocket-border bg-rocket-card p-5 ${
        war ? "animate-pulse-war border-rocket-danger" : ""
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}
