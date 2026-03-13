"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Gavel,
  Trash2,
  Trophy,
  Search,
  Eye,
  Swords,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/shared/Toast";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { formatCredits } from "@/lib/utils";

interface AuctionRow {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  category: string;
  start_time: string;
  end_time: string;
  min_bid: number;
  current_bid: number;
  current_winner_id: string | null;
  status: "active" | "closed" | "upcoming";
  blind_mode: boolean;
  created_by: string;
  created_at: string;
  bids: { count: number }[];
}

type FilterTab = "all" | "active" | "upcoming" | "closed";

function TimeRemaining({
  endTime,
  status,
}: {
  endTime: string;
  status: string;
}) {
  const { timeLeft, isUrgent, isExpired } = useCountdown(endTime);

  if (status === "closed" || isExpired) {
    return <span className="text-rocket-dim text-sm">Ended</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Clock
        size={13}
        className={isUrgent ? "text-rocket-danger" : "text-rocket-muted"}
      />
      <span
        className={`font-mono text-sm ${
          isUrgent ? "text-rocket-danger font-semibold" : "text-rocket-muted"
        }`}
      >
        {timeLeft}
      </span>
    </div>
  );
}

export default function AdminAuctions() {
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [warAuctions, setWarAuctions] = useState<Set<string>>(new Set());
  const [declaring, setDeclaring] = useState<string | null>(null);
  const supabase = createClient();
  const { addToast } = useToast();

  const fetchAuctions = useCallback(async () => {
    // Sync stale auction statuses before reading
    try {
      await fetch("/api/auctions/sync-status", { method: "PATCH" });
    } catch {
      // Non-critical — proceed regardless
    }

    const { data } = await supabase
      .from("auctions")
      .select("*, bids(count)")
      .order("created_at", { ascending: false });
    setAuctions((data as unknown as AuctionRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchWarMode = useCallback(async () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentBids } = await supabase
      .from("bids")
      .select("auction_id, bidder_id, created_at")
      .gte("created_at", oneMinuteAgo)
      .order("created_at", { ascending: true });

    const bidsByAuction: Record<
      string,
      { bidder_id: string; created_at: string }[]
    > = {};
    (recentBids ?? []).forEach((bid) => {
      if (!bidsByAuction[bid.auction_id]) {
        bidsByAuction[bid.auction_id] = [];
      }
      bidsByAuction[bid.auction_id].push(bid);
    });

    const warSet = new Set<string>();

    Object.entries(bidsByAuction).forEach(([auctionId, auctionBids]) => {
      const sorted = [...auctionBids].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      const pairExchangeMap: Record<string, number> = {};
      for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1];
        const current = sorted[i];
        if (previous.bidder_id === current.bidder_id) continue;

        const key = [previous.bidder_id, current.bidder_id].sort().join("::");
        pairExchangeMap[key] = (pairExchangeMap[key] || 0) + 1;
      }

      if (Object.values(pairExchangeMap).some((count) => count >= 3)) {
        warSet.add(auctionId);
      }
    });

    setWarAuctions(warSet);
  }, [supabase]);

  useEffect(() => {
    fetchAuctions();
    fetchWarMode();

    // Refresh auction statuses every 30 seconds
    const interval = setInterval(() => {
      fetchAuctions();
      fetchWarMode();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchAuctions, fetchWarMode]);

  async function declareWinner(auctionId: string) {
    setDeclaring(auctionId);

    try {
      const res = await fetch("/api/winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auction_id: auctionId }),
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || "Failed to declare winner", "error");
      } else {
        addToast("Winner declared!", "success");
      }
    } catch {
      addToast("Failed to declare winner", "error");
    } finally {
      setDeclaring(null);
      fetchAuctions();
    }
  }

  async function deleteAuction(id: string) {
    if (!confirm("Delete this auction permanently?")) return;

    const { error } = await supabase.from("auctions").delete().eq("id", id);
    if (error) {
      addToast("Failed to delete auction", "error");
    } else {
      addToast("Auction deleted", "success");
      fetchAuctions();
    }
  }

  if (loading) return <PageLoader />;

  const filtered = auctions.filter((a) => {
    const matchesFilter = filter === "all" || a.status === filter;
    const matchesSearch =
      search === "" || a.title.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: auctions.length },
    {
      key: "active",
      label: "Active",
      count: auctions.filter((a) => a.status === "active").length,
    },
    {
      key: "upcoming",
      label: "Upcoming",
      count: auctions.filter((a) => a.status === "upcoming").length,
    },
    {
      key: "closed",
      label: "Closed",
      count: auctions.filter((a) => a.status === "closed").length,
    },
  ];

  const statusBadgeMap: Record<string, React.ReactNode> = {
    active: <Badge variant="teal">Active</Badge>,
    closed: <Badge variant="muted">Closed</Badge>,
    upcoming: <Badge variant="gold">Upcoming</Badge>,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-rocket-text">
            Auctions
          </h1>
          <p className="text-sm text-rocket-muted mt-1">
            Manage all RocketBids auctions
          </p>
        </div>
        <Link href="/admin/auctions/create">
          <Button>
            <Plus size={16} className="mr-2" />
            Create Auction
          </Button>
        </Link>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-rocket-border bg-rocket-card p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                filter === tab.key
                  ? "bg-rocket-gold/15 text-rocket-gold font-medium"
                  : "text-rocket-muted hover:text-rocket-text"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-60">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-rocket-dim"
          />
          <input
            type="text"
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-rocket-border bg-rocket-card pl-9 pr-4 py-2 text-sm text-rocket-text placeholder:text-rocket-dim focus:border-rocket-gold focus:outline-none focus:ring-1 focus:ring-rocket-gold/50 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-rocket-border bg-rocket-card p-12 text-center">
          <Gavel className="h-10 w-10 text-rocket-dim mx-auto mb-3" />
          <p className="text-rocket-muted">
            {auctions.length === 0
              ? "No auctions yet"
              : "No auctions match your filters"}
          </p>
          {auctions.length === 0 && (
            <Link href="/admin/auctions/create">
              <Button className="mt-4" size="sm">
                Create your first auction
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((auction, idx) => {
              const bidCount = auction.bids?.[0]?.count ?? 0;
              const isWar =
                auction.status === "active" && warAuctions.has(auction.id);

              return (
                <motion.div
                  key={auction.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="rounded-xl border border-rocket-border bg-rocket-card p-4"
                >
                  <div className="flex items-center gap-3">
                    {auction.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={auction.image_url}
                        alt={auction.title}
                        className="h-12 w-12 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-rocket-bg flex items-center justify-center shrink-0">
                        <Gavel size={18} className="text-rocket-dim" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-rocket-text">
                        {auction.title}
                      </p>
                      <p className="text-xs text-rocket-muted mt-0.5">
                        {auction.category}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    {statusBadgeMap[auction.status]}
                    {auction.blind_mode && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
                        <Eye size={10} />
                        Blind
                      </span>
                    )}
                    {isWar && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rocket-danger/30 bg-rocket-danger/15 px-2 py-0.5 text-xs font-medium text-rocket-danger animate-pulse">
                        <Swords size={10} />
                        War
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-rocket-border bg-rocket-bg px-3 py-2">
                      <p className="text-rocket-dim">Current bid</p>
                      <p className="font-mono text-sm text-rocket-gold mt-0.5">
                        {formatCredits(auction.current_bid || auction.min_bid)}{" "}
                        cr
                      </p>
                    </div>
                    <div className="rounded-lg border border-rocket-border bg-rocket-bg px-3 py-2">
                      <p className="text-rocket-dim">Bids</p>
                      <p className="font-mono text-sm text-rocket-text mt-0.5">
                        {bidCount}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <TimeRemaining
                      endTime={auction.end_time}
                      status={auction.status}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {auction.status === "active" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={declaring === auction.id}
                        onClick={() => declareWinner(auction.id)}
                        className="w-full"
                      >
                        <Trophy size={14} className="mr-1" />
                        {declaring === auction.id
                          ? "Closing..."
                          : "Close + Winner"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAuction(auction.id)}
                      className={`w-full ${auction.status === "active" ? "" : "col-span-2"}`}
                    >
                      <Trash2 size={14} className="text-rocket-danger" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="hidden rounded-xl border border-rocket-border overflow-hidden overflow-x-auto md:block">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-rocket-border bg-rocket-card">
                  <th className="px-4 py-3 text-left text-xs font-medium text-rocket-muted uppercase tracking-wider">
                    Auction
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-rocket-muted uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-rocket-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-rocket-muted uppercase tracking-wider">
                    Current Bid
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-rocket-muted uppercase tracking-wider">
                    Bids
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-rocket-muted uppercase tracking-wider">
                    Time Remaining
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-rocket-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rocket-border">
                {filtered.map((auction, idx) => {
                  const bidCount = auction.bids?.[0]?.count ?? 0;
                  const isWar =
                    auction.status === "active" && warAuctions.has(auction.id);

                  return (
                    <motion.tr
                      key={auction.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className={`bg-rocket-bg hover:bg-rocket-card/50 transition-colors ${
                        isWar ? "border-l-2 border-l-rocket-danger" : ""
                      }`}
                    >
                      {/* Image + Title */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {auction.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={auction.image_url}
                              alt={auction.title}
                              className="h-10 w-10 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-rocket-card flex items-center justify-center shrink-0">
                              <Gavel size={16} className="text-rocket-dim" />
                            </div>
                          )}
                          <p className="text-sm font-medium text-rocket-text truncate max-w-[180px]">
                            {auction.title}
                          </p>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-rocket-muted">
                          {auction.category}
                        </span>
                      </td>

                      {/* Status + Badges */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {statusBadgeMap[auction.status]}
                          {auction.blind_mode && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
                              <Eye size={10} />
                              Blind
                            </span>
                          )}
                          {isWar && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rocket-danger/30 bg-rocket-danger/15 px-2 py-0.5 text-xs font-medium text-rocket-danger animate-pulse">
                              <Swords size={10} />
                              War
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Current Bid */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-rocket-gold font-semibold">
                          {formatCredits(
                            auction.current_bid || auction.min_bid,
                          )}{" "}
                          cr
                        </span>
                      </td>

                      {/* Bids Count */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-rocket-text">
                          {bidCount}
                        </span>
                      </td>

                      {/* Time Remaining */}
                      <td className="px-4 py-3">
                        <TimeRemaining
                          endTime={auction.end_time}
                          status={auction.status}
                        />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {auction.status === "active" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={declaring === auction.id}
                              onClick={() => declareWinner(auction.id)}
                            >
                              <Trophy size={14} className="mr-1" />
                              {declaring === auction.id
                                ? "Closing..."
                                : "Close + Winner"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAuction(auction.id)}
                          >
                            <Trash2 size={14} className="text-rocket-danger" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
