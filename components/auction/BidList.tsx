"use client";

import { motion } from "framer-motion";
import { formatDistanceToNow } from "@/lib/utils";
import type { Bid } from "@/lib/hooks/useAuctions";

interface BidListProps {
  bids: Bid[];
  currentUserId?: string;
}

export function BidList({ bids, currentUserId }: BidListProps) {
  if (bids.length === 0) {
    return (
      <div className="text-center py-8 text-rocket-muted text-sm">
        No bids yet. Be the first!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bids.map((bid, index) => (
        <motion.div
          key={bid.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
            index === 0
              ? "border-rocket-gold/30 bg-rocket-gold/5"
              : "border-rocket-border bg-rocket-card"
          } ${bid.bidder_id === currentUserId ? "ring-1 ring-rocket-teal/30" : ""}`}
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-rocket-dim w-6 text-right">
              #{bids.length - index}
            </span>
            <span className="text-sm text-rocket-text">
              {bid.bidder_id === currentUserId ? (
                <span className="text-rocket-teal font-medium">You</span>
              ) : (
                <span className="text-rocket-muted">
                  {bid.bidder_id.slice(0, 8)}...
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-mono text-sm font-semibold text-rocket-gold">
              {bid.amount} cr
            </span>
            <span className="text-xs text-rocket-dim">
              {formatDistanceToNow(bid.created_at)}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
