"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: "gold" | "teal" | "danger";
}

const colorMap = {
  gold: "text-rocket-gold bg-rocket-gold/10",
  teal: "text-rocket-teal bg-rocket-teal/10",
  danger: "text-rocket-danger bg-rocket-danger/10",
};

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "gold",
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-rocket-border bg-rocket-card p-5"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-rocket-muted">{title}</p>
          <p className="font-mono text-2xl font-bold text-rocket-text">
            {value}
          </p>
          {trend && <p className="text-xs text-rocket-teal">{trend}</p>}
        </div>
        <div className={`rounded-lg p-2.5 ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </motion.div>
  );
}
