"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { History, Gavel, ArrowUpRight, ArrowDownLeft, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/useUser";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";

interface BidHistoryItem {
  id: string;
  auction_id: string;
  amount: number;
  created_at: string;
  auction_title: string;
  auction_status: "active" | "closed" | "upcoming" | "unknown";
  current_winner_id: string | null;
  current_bid: number;
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  created_at: string;
}

type BidBadgeVariant = "teal" | "danger" | "gold" | "muted";

function getBidStatus(
  bid: BidHistoryItem,
  profileId: string,
): { label: string; variant: BidBadgeVariant } {
  const isExactWinningBid =
    bid.current_winner_id === profileId && bid.amount === bid.current_bid;

  if (bid.auction_status === "closed") {
    return isExactWinningBid
      ? { label: "Won", variant: "teal" }
      : { label: "Lost", variant: "muted" };
  }

  if (bid.auction_status === "active") {
    return isExactWinningBid
      ? { label: "Winning", variant: "teal" }
      : { label: "Outbid", variant: "danger" };
  }

  return { label: "Upcoming", variant: "gold" };
}

export default function BidHistory() {
  const { user } = useUser();
  const [bids, setBids] = useState<BidHistoryItem[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [tab, setTab] = useState<"bids" | "credits">("bids");
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!user) return;

    async function fetchHistory() {
      const [bidsRes, auctionsRes, transactionsRes] = await Promise.all([
        supabase
          .from("bids")
          .select("*")
          .eq("bidder_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("auctions")
          .select("id, title, status, current_winner_id, current_bid"),
        supabase
          .from("credit_transactions")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false }),
      ]);

      const auctionMap: Record<
        string,
        {
          title: string;
          status: "active" | "closed" | "upcoming";
          current_winner_id: string | null;
          current_bid: number;
        }
      > = {};
      (auctionsRes.data ?? []).forEach((a) => {
        auctionMap[a.id] = {
          title: a.title,
          status: a.status as "active" | "closed" | "upcoming",
          current_winner_id: a.current_winner_id,
          current_bid: a.current_bid ?? 0,
        };
      });

      const bidHistory: BidHistoryItem[] = (bidsRes.data ?? []).map((bid) => ({
        id: bid.id,
        auction_id: bid.auction_id,
        amount: bid.amount,
        created_at: bid.created_at,
        auction_title: auctionMap[bid.auction_id]?.title ?? "Unknown Auction",
        auction_status: auctionMap[bid.auction_id]?.status ?? "unknown",
        current_winner_id:
          auctionMap[bid.auction_id]?.current_winner_id ?? null,
        current_bid: auctionMap[bid.auction_id]?.current_bid ?? 0,
      }));

      setBids(bidHistory);
      setTransactions((transactionsRes.data as CreditTransaction[]) ?? []);
      setLoading(false);
    }

    void fetchHistory();
  }, [user, supabase]);

  if (loading) return <PageLoader />;

  const typeLabels: Record<
    string,
    { label: string; color: "teal" | "danger" | "gold" | "muted" }
  > = {
    assign: { label: "Assigned", color: "teal" },
    bid_deduct: { label: "Credits Reserved", color: "gold" },
    bid_refund: { label: "Reservation Released", color: "teal" },
    winner_deduct: { label: "Winner Deduction", color: "gold" },
    mining: { label: "Mining Bonus", color: "gold" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-rocket-text">
          History
        </h1>
        <p className="text-sm text-rocket-muted mt-1">
          Your bids and credit transactions
        </p>
      </div>

      <div className="flex gap-1 border-b border-rocket-border">
        <button
          onClick={() => setTab("bids")}
          className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
            tab === "bids"
              ? "border-rocket-gold text-rocket-gold font-medium"
              : "border-transparent text-rocket-muted hover:text-rocket-text"
          }`}
        >
          <Gavel size={14} className="inline mr-1.5" />
          My Bids ({bids.length})
        </button>
        <button
          onClick={() => setTab("credits")}
          className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
            tab === "credits"
              ? "border-rocket-gold text-rocket-gold font-medium"
              : "border-transparent text-rocket-muted hover:text-rocket-text"
          }`}
        >
          <History size={14} className="inline mr-1.5" />
          Credit Log ({transactions.length})
        </button>
      </div>

      {tab === "bids" && (
        <div className="space-y-2">
          {bids.length === 0 ? (
            <div className="rounded-xl border border-rocket-border bg-rocket-card p-12 text-center">
              <Gavel className="h-10 w-10 text-rocket-dim mx-auto mb-3" />
              <p className="text-rocket-muted">No bids placed yet</p>
            </div>
          ) : (
            bids.map((bid, idx) => (
              <motion.div
                key={bid.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex items-center justify-between rounded-xl border border-rocket-border bg-rocket-card px-5 py-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-rocket-text">
                    {bid.auction_title}
                  </p>
                  <p className="text-xs text-rocket-muted">
                    {formatDate(bid.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-rocket-gold">
                    {bid.amount} cr
                  </span>
                  {(() => {
                    const bidStatus = getBidStatus(bid, user?.id ?? "");
                    return (
                      <Badge variant={bidStatus.variant}>
                        {bidStatus.label}
                      </Badge>
                    );
                  })()}
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {tab === "credits" && (
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <div className="rounded-xl border border-rocket-border bg-rocket-card p-12 text-center">
              <History className="h-10 w-10 text-rocket-dim mx-auto mb-3" />
              <p className="text-rocket-muted">No credit transactions</p>
            </div>
          ) : (
            transactions.map((tx, idx) => {
              const typeInfo = typeLabels[tx.type] ?? {
                label: tx.type,
                color: "muted" as const,
              };
              const isPositive = tx.amount > 0;
              const isMining = tx.type === "mining";

              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="flex items-center justify-between rounded-xl border border-rocket-border bg-rocket-card px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-2 ${
                        isMining
                          ? "bg-purple-500/15 text-purple-400"
                          : isPositive
                            ? "bg-rocket-teal/10 text-rocket-teal"
                            : "bg-rocket-danger/10 text-rocket-danger"
                      }`}
                    >
                      {isMining ? (
                        <Zap size={16} />
                      ) : isPositive ? (
                        <ArrowDownLeft size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </div>
                    <div className="space-y-1">
                      {isMining ? (
                        <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2.5 py-0.5 text-xs font-medium text-purple-400">
                          <Zap size={11} className="mr-1" />
                          {typeInfo.label}
                        </span>
                      ) : (
                        <Badge variant={typeInfo.color}>{typeInfo.label}</Badge>
                      )}
                      {tx.note && (
                        <p className="text-xs text-rocket-muted">{tx.note}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <p
                      className={`font-mono text-sm font-semibold ${
                        isMining
                          ? "text-purple-400"
                          : isPositive
                            ? "text-rocket-teal"
                            : "text-rocket-danger"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {tx.amount} cr
                    </p>
                    <p className="text-xs text-rocket-dim">
                      {formatDate(tx.created_at)}
                    </p>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
