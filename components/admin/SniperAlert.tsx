"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatDistanceToNow } from "@/lib/utils";

interface SniperAlertProps {
  userId: string;
  userName: string;
  lastSecondBids: number;
  lastBidTime: string;
}

export function SniperAlert({ userName, lastSecondBids, lastBidTime }: SniperAlertProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border border-rocket-danger/40 bg-rocket-danger/5 p-4 animate-pulse-war"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-rocket-danger/15 p-2">
          <Crosshair size={18} className="text-rocket-danger" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-rocket-text text-sm">{userName}</span>
            <Badge variant="danger">Sniper</Badge>
          </div>
          <p className="text-xs text-rocket-muted">
            {lastSecondBids} last-second bids detected
          </p>
          <p className="text-xs text-rocket-dim">
            Last bid: {formatDistanceToNow(lastBidTime)}
          </p>
        </div>
        <AlertTriangle size={16} className="text-rocket-danger shrink-0 mt-1" />
      </div>
    </motion.div>
  );
}
