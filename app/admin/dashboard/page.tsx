"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel,
  Users,
  TrendingUp,
  Coins,
  Clock,
  Activity,
  Crosshair,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/admin/StatCard";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { useReactionToast } from "@/components/shared/ReactionToast";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { formatDistanceToNow, formatCredits } from "@/lib/utils";

interface Stats {
  activeAuctions: number;
  totalBidders: number;
  bidsToday: number;
  creditsInCirculation: number;
}

interface LiveBid {
  id: string;
  amount: number;
  created_at: string;
  bidder: { full_name: string } | null;
  auction: { title: string } | null;
}

interface SniperUser {
  userId: string;
  userName: string;
  snipeCount: number;
  lastBidTime: string;
}

interface EndingSoonAuction {
  id: string;
  title: string;
  current_bid: number;
  min_bid: number;
  end_time: string;
  status: string;
}

function EndingSoonCard({ auction }: { auction: EndingSoonAuction }) {
  const { timeLeft, isUrgent } = useCountdown(auction.end_time);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center justify-between rounded-lg border border-rocket-border bg-rocket-bg p-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-rocket-text truncate">
          {auction.title}
        </p>
        <p className="font-mono text-xs text-rocket-gold">
          {auction.current_bid || auction.min_bid} cr
        </p>
      </div>
      <div className="flex items-center gap-1.5 ml-3 shrink-0">
        <Clock
          size={14}
          className={isUrgent ? "text-rocket-danger" : "text-rocket-muted"}
        />
        <span
          className={`font-mono text-sm ${
            isUrgent
              ? "text-rocket-danger font-semibold"
              : "text-rocket-muted"
          }`}
        >
          {timeLeft}
        </span>
      </div>
    </motion.div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [liveBids, setLiveBids] = useState<LiveBid[]>([]);
  const [snipers, setSnipers] = useState<SniperUser[]>([]);
  const [endingSoon, setEndingSoon] = useState<EndingSoonAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const { triggerReaction } = useReactionToast();
  const hasSniperHydratedRef = useRef(false);
  const prevSniperIdsRef = useRef<Set<string>>(new Set());
  const supabase = createClient();

  const fetchStats = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeRes, biddersRes, bidsTodayRes, creditsRes] =
      await Promise.all([
        supabase
          .from("auctions")
          .select("*", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("role", "bidder"),
        supabase
          .from("bids")
          .select("*", { count: "exact", head: true })
          .gte("created_at", today.toISOString()),
        supabase
          .from("profiles")
          .select("credits")
          .eq("role", "bidder"),
      ]);

    const totalCredits = (creditsRes.data ?? []).reduce(
      (sum, p) => sum + (p.credits || 0),
      0
    );

    setStats({
      activeAuctions: activeRes.count ?? 0,
      totalBidders: biddersRes.count ?? 0,
      bidsToday: bidsTodayRes.count ?? 0,
      creditsInCirculation: totalCredits,
    });
  }, [supabase]);

  const fetchLiveBids = useCallback(async () => {
    const { data } = await supabase
      .from("bids")
      .select(
        "id, amount, created_at, bidder:bidder_id(full_name), auction:auction_id(title)"
      )
      .order("created_at", { ascending: false })
      .limit(10);

    setLiveBids((data as unknown as LiveBid[]) ?? []);
  }, [supabase]);

  const fetchSnipers = useCallback(async () => {
    const { data: snipeBids } = await supabase
      .from("bids")
      .select("bidder_id, created_at, bidder:bidder_id(full_name)")
      .eq("is_snipe", true);

    interface SnipeBid {
      bidder_id: string;
      created_at: string;
      bidder: { full_name: string } | null;
    }

    const snipeMap: Record<
      string,
      { name: string; count: number; lastBidTime: string }
    > = {};

    ((snipeBids as unknown as SnipeBid[]) ?? []).forEach((bid) => {
      const id = bid.bidder_id;
      if (!snipeMap[id]) {
        snipeMap[id] = {
          name: bid.bidder?.full_name ?? "Unknown",
          count: 0,
          lastBidTime: bid.created_at,
        };
      }
      snipeMap[id].count++;
      if (new Date(bid.created_at) > new Date(snipeMap[id].lastBidTime)) {
        snipeMap[id].lastBidTime = bid.created_at;
      }
    });

    const flagged = Object.entries(snipeMap)
      .filter(([, d]) => d.count >= 3)
      .map(([userId, d]) => ({
        userId,
        userName: d.name,
        snipeCount: d.count,
        lastBidTime: d.lastBidTime,
      }))
      .sort((a, b) => b.snipeCount - a.snipeCount);

    setSnipers(flagged);
  }, [supabase]);

  const fetchEndingSoon = useCallback(async () => {
    const twoHoursFromNow = new Date(
      Date.now() + 2 * 60 * 60 * 1000
    ).toISOString();

    const { data } = await supabase
      .from("auctions")
      .select("id, title, current_bid, min_bid, end_time, status")
      .eq("status", "active")
      .lte("end_time", twoHoursFromNow)
      .gte("end_time", new Date().toISOString())
      .order("end_time", { ascending: true });

    setEndingSoon((data as EndingSoonAuction[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    async function init() {
      // Sync auction statuses first so all stats reflect the latest state
      try {
        await fetch("/api/auctions/sync-status", { method: "PATCH" });
      } catch {
        // Non-critical
      }

      await Promise.all([
        fetchStats(),
        fetchLiveBids(),
        fetchSnipers(),
        fetchEndingSoon(),
      ]);
      setLoading(false);
    }
    init();
  }, [fetchStats, fetchLiveBids, fetchSnipers, fetchEndingSoon]);

  // Realtime subscription for live bid feed
  useEffect(() => {
    const channel = supabase
      .channel("admin-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bids" },
        () => {
          fetchLiveBids();
          fetchStats();
          fetchEndingSoon();
          fetchSnipers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchLiveBids, fetchStats, fetchEndingSoon, fetchSnipers]);

  useEffect(() => {
    const currentSniperIds = new Set(snipers.map((s) => s.userId));

    if (!hasSniperHydratedRef.current) {
      hasSniperHydratedRef.current = true;
      prevSniperIdsRef.current = currentSniperIds;
      return;
    }

    const hasNewSniper = Array.from(currentSniperIds).some(
      (id) => !prevSniperIdsRef.current.has(id),
    );

    if (hasNewSniper) {
      triggerReaction("sniper_flagged");
    }

    prevSniperIdsRef.current = currentSniperIds;
  }, [snipers, triggerReaction]);

  // Sniper radar polling every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchSnipers, 30000);
    return () => clearInterval(interval);
  }, [fetchSnipers]);

  if (loading || !stats) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-rocket-text">
          Admin Dashboard
        </h1>
        <p className="text-sm text-rocket-muted mt-1">
          RocketBids platform overview
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Auctions"
          value={stats.activeAuctions}
          icon={Gavel}
          color="gold"
        />
        <StatCard
          title="Total Bidders"
          value={stats.totalBidders}
          icon={Users}
          color="teal"
        />
        <StatCard
          title="Bids Today"
          value={stats.bidsToday}
          icon={TrendingUp}
          color="gold"
        />
        <StatCard
          title="Credits in Circulation"
          value={formatCredits(stats.creditsInCirculation)}
          icon={Coins}
          color="teal"
        />
      </div>

      {/* Bottom Row: Live Feed + Sniper Radar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Live Bid Feed */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-rocket-border bg-rocket-card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-rocket-teal" />
            <h2 className="font-display text-lg font-semibold text-rocket-text">
              Live Bid Feed
            </h2>
            <span className="relative flex h-2 w-2 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rocket-teal opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rocket-teal" />
            </span>
          </div>

          {liveBids.length === 0 ? (
            <p className="text-center py-8 text-rocket-muted text-sm">
              No bids yet
            </p>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {liveBids.map((bid) => (
                  <motion.div
                    key={bid.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex items-center justify-between rounded-lg border border-rocket-border bg-rocket-bg p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-rocket-text truncate">
                        {bid.bidder?.full_name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-rocket-muted truncate">
                        {bid.auction?.title ?? "Unknown auction"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <span className="font-mono text-sm font-semibold text-rocket-gold">
                        {bid.amount} cr
                      </span>
                      <span className="text-xs text-rocket-dim whitespace-nowrap">
                        {formatDistanceToNow(bid.created_at)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Sniper Radar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-rocket-border bg-rocket-card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Crosshair size={18} className="text-rocket-danger" />
            <h2 className="font-display text-lg font-semibold text-rocket-text">
              Sniper Radar
            </h2>
            <Badge variant="danger">{snipers.length} flagged</Badge>
          </div>

          {snipers.length === 0 ? (
            <div className="text-center py-8">
              <Crosshair
                size={32}
                className="text-rocket-dim mx-auto mb-2"
              />
              <p className="text-sm text-rocket-muted">
                No snipers detected
              </p>
              <p className="text-xs text-rocket-dim mt-1">
                Updates every 30 seconds
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {snipers.map((sniper) => (
                <motion.div
                  key={sniper.userId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-lg border border-rocket-danger/40 bg-rocket-danger/5 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-rocket-danger/15 p-2 shrink-0">
                      <AlertTriangle
                        size={16}
                        className="text-rocket-danger"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-rocket-text text-sm truncate">
                          {sniper.userName}
                        </span>
                        <Badge variant="danger">Sniper</Badge>
                      </div>
                      <p className="text-xs text-rocket-muted mt-0.5">
                        {sniper.snipeCount} last-second bid
                        {sniper.snipeCount !== 1 ? "s" : ""} detected
                      </p>
                      <p className="text-xs text-rocket-dim">
                        Last snipe:{" "}
                        {formatDistanceToNow(sniper.lastBidTime)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Auctions Ending Soon */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-rocket-border bg-rocket-card p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-rocket-gold" />
          <h2 className="font-display text-lg font-semibold text-rocket-text">
            Auctions Ending Soon
          </h2>
          <Badge variant="gold">{endingSoon.length}</Badge>
        </div>

        {endingSoon.length === 0 ? (
          <p className="text-center py-8 text-rocket-muted text-sm">
            No auctions ending within 2 hours
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {endingSoon.map((auction) => (
              <EndingSoonCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
