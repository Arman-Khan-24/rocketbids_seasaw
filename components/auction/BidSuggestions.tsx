"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Bid } from "@/lib/hooks/useAuctions";

interface BidSuggestionsProps {
  bids: Bid[];
  currentBid: number;
  minBid: number;
  endTime: string;
  warMode: boolean;
  creditBalance: number;
  onSelect: (amount: number) => void;
}

type Recommendation = "INVEST" | "AVOID" | "WAIT";
type TierKey = "safe" | "optimal" | "aggressive";

interface GeminiOverlay {
  recommendation: Recommendation;
  explanation: string;
  labels: Record<TierKey, string>;
}

const TIERS = [
  {
    key: "safe" as TierKey,
    label: "Safe",
    multiplier: 1,
    probRange: [40, 55] as [number, number],
    color: "text-rocket-teal",
    bg: "bg-rocket-teal/5 hover:bg-rocket-teal/10",
    border: "border-rocket-teal/20",
  },
  {
    key: "optimal" as TierKey,
    label: "Optimal",
    multiplier: 1.5,
    probRange: [60, 75] as [number, number],
    color: "text-rocket-gold",
    bg: "bg-rocket-gold/5 hover:bg-rocket-gold/10",
    border: "border-rocket-gold/20",
  },
  {
    key: "aggressive" as TierKey,
    label: "Aggressive",
    multiplier: 2.5,
    probRange: [80, 92] as [number, number],
    color: "text-rocket-danger",
    bg: "bg-rocket-danger/5 hover:bg-rocket-danger/10",
    border: "border-rocket-danger/20",
  },
];

const BANNER_STYLE: Record<Recommendation, string> = {
  INVEST: "bg-emerald-500/12 text-emerald-400",
  AVOID: "bg-rocket-danger/12 text-rocket-danger",
  WAIT: "bg-rocket-gold/12 text-rocket-gold",
};

export function BidSuggestions({
  bids,
  currentBid,
  minBid,
  endTime,
  warMode,
  creditBalance,
  onSelect,
}: BidSuggestionsProps) {
  const [geminiOverlay, setGeminiOverlay] = useState<GeminiOverlay | null>(
    null,
  );

  // Average increment from the last 10 bids (sorted oldest to newest).
  const avgIncrement = useMemo(() => {
    const sorted = [...bids]
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      .slice(-10);

    if (sorted.length < 2) {
      return minBid;
    }

    const increments = sorted
      .slice(1)
      .map((b, i) => b.amount - sorted[i].amount)
      .filter((d) => d > 0);

    if (increments.length === 0) {
      return minBid;
    }

    return Math.max(
      1,
      Math.round(increments.reduce((a, b) => a + b, 0) / increments.length),
    );
  }, [bids, minBid]);

  const activeBidders = useMemo(
    () => new Set(bids.map((b) => b.bidder_id)).size,
    [bids],
  );

  const base = currentBid > 0 ? currentBid : minBid;
  const msLeft = Math.max(0, new Date(endTime).getTime() - Date.now());
  const hoursLeft = msLeft / (1000 * 60 * 60);

  // Each extra bidder beyond 1 costs ~3% win chance; lots of time left costs up to 8%.
  const bidderPenalty = Math.min(15, Math.max(0, (activeBidders - 1) * 3));
  const timePenalty = Math.min(8, Math.round(hoursLeft * 0.5));

  const lastFiveBids = useMemo(
    () =>
      [...bids]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 5)
        .map((b) => ({ amount: b.amount, timestamp: b.created_at })),
    [bids],
  );

  const fallbackOverlay = useMemo<GeminiOverlay>(() => {
    const recommendation: Recommendation =
      warMode || creditBalance < base
        ? "WAIT"
        : creditBalance >= base * 2
          ? "INVEST"
          : "WAIT";

    return {
      recommendation,
      explanation:
        recommendation === "INVEST"
          ? "Local trend says momentum favors a stronger bid now."
          : "Using local fallback while AI guidance is unavailable.",
      labels: {
        safe: "Lower risk local estimate",
        optimal: "Balanced local estimate",
        aggressive: "High pressure local estimate",
      },
    };
  }, [warMode, creditBalance, base]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    setGeminiOverlay(fallbackOverlay);

    async function fetchGeminiOverlay() {
      try {
        const res = await fetch("/api/ai/bid-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            current_bid: currentBid,
            last_5_bids: lastFiveBids,
            active_bidders: activeBidders,
            time_remaining_seconds: Math.max(
              0,
              Math.floor((new Date(endTime).getTime() - Date.now()) / 1000),
            ),
            war_mode: warMode,
            credit_balance: creditBalance,
          }),
        });

        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as Partial<GeminiOverlay>;
        if (cancelled) {
          return;
        }

        if (
          data.recommendation &&
          data.explanation &&
          data.labels?.safe &&
          data.labels?.optimal &&
          data.labels?.aggressive
        ) {
          setGeminiOverlay({
            recommendation: data.recommendation,
            explanation: data.explanation,
            labels: data.labels as Record<TierKey, string>,
          });
        }
      } catch {
        // Graceful fallback: keep local recommendation overlay.
      } finally {
        clearTimeout(timeoutId);
      }
    }

    void fetchGeminiOverlay();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    currentBid,
    endTime,
    activeBidders,
    warMode,
    creditBalance,
    lastFiveBids,
    fallbackOverlay,
  ]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2.5"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-rocket-dim" />
        <span className="text-xs font-medium text-rocket-dim uppercase tracking-wider">
          AI Suggestions
        </span>
      </div>

      {geminiOverlay && (
        <div className="space-y-1.5">
          <div
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide ${
              BANNER_STYLE[geminiOverlay.recommendation]
            }`}
          >
            {geminiOverlay.recommendation}
          </div>
          <p className="text-xs text-rocket-muted">
            {geminiOverlay.explanation}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {TIERS.map(
          ({ key, label, multiplier, probRange, color, bg, border }) => {
            const amount = Math.round(base + avgIncrement * multiplier);
            const mid = Math.round((probRange[0] + probRange[1]) / 2);
            const raw = mid - bidderPenalty - timePenalty;
            const prob = Math.max(
              probRange[0] - 4,
              Math.min(probRange[1], raw),
            );

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(amount)}
                className={`rounded-lg border ${border} ${bg} p-2.5 text-left transition-colors`}
              >
                <p className={`text-xs font-semibold ${color}`}>{label}</p>
                <p className={`font-mono text-sm font-bold ${color} mt-0.5`}>
                  {amount} cr
                </p>
                {geminiOverlay?.labels[key] && (
                  <p className="mt-1 text-[11px] text-rocket-dim">
                    {geminiOverlay.labels[key]}
                  </p>
                )}
                <p className="text-xs text-rocket-dim mt-1">{prob}% win</p>
              </button>
            );
          },
        )}
      </div>
    </motion.div>
  );
}
