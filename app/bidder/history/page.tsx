"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { History, Gavel, ArrowUpRight, ArrowDownLeft } from "lucide-react";
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
  auction_status: string;
  is_winning: boolean;
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  created_at: string;
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
          .select("id, title, status, current_winner_id"),
        supabase
          .from("credit_transactions")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false }),
      ]);

      const auctionMap: Record<
        string,
        { title: string; status: string; current_winner_id: string | null }
      > = {};
      (auctionsRes.data ?? []).forEach((a) => {
        auctionMap[a.id] = {
          title: a.title,
          status: a.status,
          current_winner_id: a.current_winner_id,
        };
      });

      const bidHistory: BidHistoryItem[] = (bidsRes.data ?? []).map((bid) => ({
        id: bid.id,
        auction_id: bid.auction_id,
        amount: bid.amount,
        created_at: bid.created_at,
        auction_title: auctionMap[bid.auction_id]?.title ?? "Unknown Auction",
        auction_status: auctionMap[bid.auction_id]?.status ?? "unknown",
        is_winning: auctionMap[bid.auction_id]?.current_winner_id === user!.id,
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
    bid_deduct: { label: "Bid Placed", color: "danger" },
    bid_refund: { label: "Refund (Outbid)", color: "teal" },
    winner_deduct: { label: "Winner Deduction", color: "gold" },
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
                  {bid.is_winning ? (
                    <Badge variant="teal">Winning</Badge>
                  ) : bid.auction_status === "closed" ? (
                    <Badge variant="muted">Lost</Badge>
                  ) : (
                    <Badge variant="gold">Active</Badge>
                  )}
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
                        isPositive
                          ? "bg-rocket-teal/10 text-rocket-teal"
                          : "bg-rocket-danger/10 text-rocket-danger"
                      }`}
                    >
                      {isPositive ? (
                        <ArrowDownLeft size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Badge variant={typeInfo.color}>{typeInfo.label}</Badge>
                      {tx.note && (
                        <p className="text-xs text-rocket-muted">{tx.note}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <p
                      className={`font-mono text-sm font-semibold ${
                        isPositive ? "text-rocket-teal" : "text-rocket-danger"
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
