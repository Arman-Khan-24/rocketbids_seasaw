"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Gavel, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/shared/Toast";
import { useUser } from "@/lib/hooks/useUser";

interface BidFormProps {
  auctionId: string;
  currentBid: number;
  minBid: number;
  status: string;
  isExpired: boolean;
}

export function BidForm({
  auctionId,
  currentBid,
  minBid,
  status,
  isExpired,
}: BidFormProps) {
  const { profile } = useUser();
  const { addToast } = useToast();
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const minimumAmount = currentBid > 0 ? currentBid + 1 : minBid;

  async function handleBid(e: React.FormEvent) {
    e.preventDefault();
    const bidAmount = parseInt(amount, 10);

    if (isNaN(bidAmount) || bidAmount < minimumAmount) {
      addToast(`Minimum bid is ${minimumAmount} credits`, "error");
      return;
    }

    if (profile && bidAmount > profile.credits) {
      addToast("Insufficient credits", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auction_id: auctionId, amount: bidAmount }),
      });

      const data = await res.json();

      if (!res.ok) {
        addToast(data.error || "Failed to place bid", "error");
      } else {
        addToast(`Bid of ${bidAmount} credits placed!`, "success");
        setAmount("");
      }
    } catch {
      addToast("Network error — try again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "closed" || isExpired) {
    return (
      <div className="rounded-lg border border-rocket-border bg-rocket-card p-4 text-center">
        <p className="text-rocket-muted text-sm">This auction has ended.</p>
      </div>
    );
  }

  if (profile?.role !== "bidder") {
    return null;
  }

  return (
    <motion.form
      onSubmit={handleBid}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-rocket-border bg-rocket-card p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-rocket-text flex items-center gap-2">
          <Gavel size={18} className="text-rocket-gold" />
          Place Your Bid
        </h3>
        <span className="font-mono text-sm text-rocket-muted">
          Min: {minimumAmount} cr
        </span>
      </div>

      {profile && profile.credits < minimumAmount && (
        <div className="flex items-center gap-2 rounded-lg bg-rocket-danger/10 border border-rocket-danger/20 px-3 py-2 text-sm text-rocket-danger">
          <AlertTriangle size={14} />
          Not enough credits ({profile.credits} available)
        </div>
      )}

      <div className="flex gap-3">
        <Input
          type="number"
          placeholder={`${minimumAmount}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={minimumAmount}
          className="font-mono"
        />
        <Button
          type="submit"
          disabled={
            submitting || (profile ? profile.credits < minimumAmount : true)
          }
          className="shrink-0"
        >
          {submitting ? "Bidding..." : "Bid"}
        </Button>
      </div>

      <p className="text-xs text-rocket-muted">
        Your balance:{" "}
        <span className="font-mono text-rocket-gold">
          {profile?.credits ?? 0} cr
        </span>
      </p>
    </motion.form>
  );
}
