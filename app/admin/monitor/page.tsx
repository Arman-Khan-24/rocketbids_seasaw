"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Monitor, Crosshair, Swords, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SniperAlert } from "@/components/admin/SniperAlert";
import { PageLoader } from "@/components/ui/Spinner";
import { useReactionToast } from "@/components/shared/ReactionToast";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { formatDistanceToNow } from "@/lib/utils";
import type { Auction } from "@/lib/hooks/useAuctions";

interface LiveBid {
  id: string;
  auction_id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
  bidder_name?: string;
  auction_title?: string;
}

interface SniperData {
  userId: string;
  userName: string;
  lastSecondBids: number;
  lastBidTime: string;
}

interface WarState {
  auctionId: string;
  users: string[];
}

function LiveAuctionCard({ auction }: { auction: Auction }) {
  const { timeLeft, isUrgent } = useCountdown(auction.end_time);

  return (
    <div className="rounded-lg border border-rocket-border bg-rocket-bg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-rocket-text truncate">
          {auction.title}
        </span>
        <Badge variant={isUrgent ? "danger" : "teal"}>{timeLeft}</Badge>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-rocket-muted">Current bid</span>
        <span className="font-mono text-rocket-gold font-semibold">
          {auction.current_bid || auction.min_bid} cr
        </span>
      </div>
    </div>
  );
}

export default function AdminMonitor() {
  const [activeAuctions, setActiveAuctions] = useState<Auction[]>([]);
  const [recentBids, setRecentBids] = useState<LiveBid[]>([]);
  const [snipers, setSnipers] = useState<SniperData[]>([]);
  const [wars, setWars] = useState<WarState[]>([]);
  const [loading, setLoading] = useState(true);
  const { triggerReaction } = useReactionToast();
  const hasSniperHydratedRef = useRef(false);
  const prevSniperIdsRef = useRef<Set<string>>(new Set());
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    const [auctionsRes, bidsRes] = await Promise.all([
      supabase
        .from("auctions")
        .select("*")
        .eq("status", "active")
        .order("end_time", { ascending: true }),
      supabase
        .from("bids")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const auctions = (auctionsRes.data as Auction[]) ?? [];
    const bids = (bidsRes.data as LiveBid[]) ?? [];

    setActiveAuctions(auctions);
    setRecentBids(bids);

    // Detect snipers: users with 3+ bids flagged as snipes (is_snipe = true)
    const { data: snipeBidsData } = await supabase
      .from("bids")
      .select("bidder_id, created_at")
      .eq("is_snipe", true);

    const sniperMap: Record<string, { count: number; lastBid: string }> = {};
    ((snipeBidsData as { bidder_id: string; created_at: string }[]) ?? []).forEach((bid) => {
      if (!sniperMap[bid.bidder_id]) {
        sniperMap[bid.bidder_id] = { count: 0, lastBid: bid.created_at };
      }
      sniperMap[bid.bidder_id].count++;
      if (bid.created_at > sniperMap[bid.bidder_id].lastBid) {
        sniperMap[bid.bidder_id].lastBid = bid.created_at;
      }
    });

    const detectedSnipers: SniperData[] = Object.entries(sniperMap)
      .filter(([, data]) => data.count >= 3)
      .map(([userId, data]) => ({
        userId,
        userName: userId.slice(0, 8),
        lastSecondBids: data.count,
        lastBidTime: data.lastBid,
      }));
    setSnipers(detectedSnipers);

    // Detect bidding wars: same 2 users bid 3+ times in 60s on same auction
    const warDetector: Record<string, Record<string, { times: number[] }>> = {};
    bids.forEach((bid) => {
      if (!warDetector[bid.auction_id]) warDetector[bid.auction_id] = {};
      if (!warDetector[bid.auction_id][bid.bidder_id]) {
        warDetector[bid.auction_id][bid.bidder_id] = { times: [] };
      }
      warDetector[bid.auction_id][bid.bidder_id].times.push(
        new Date(bid.created_at).getTime(),
      );
    });

    const detectedWars: WarState[] = [];
    Object.entries(warDetector).forEach(([auctionId, users]) => {
      const userIds = Object.keys(users);
      for (let i = 0; i < userIds.length; i++) {
        for (let j = i + 1; j < userIds.length; j++) {
          const timesA = users[userIds[i]].times;
          const timesB = users[userIds[j]].times;
          const allTimes = [...timesA, ...timesB].sort();
          for (let k = 0; k < allTimes.length - 5; k++) {
            if (allTimes[k + 5] - allTimes[k] <= 60000) {
              const aInteractions = timesA.filter(
                (t) => t >= allTimes[k] && t <= allTimes[k + 5],
              ).length;
              const bInteractions = timesB.filter(
                (t) => t >= allTimes[k] && t <= allTimes[k + 5],
              ).length;
              if (aInteractions >= 3 && bInteractions >= 3) {
                detectedWars.push({
                  auctionId,
                  users: [userIds[i], userIds[j]],
                });
                break;
              }
            }
          }
        }
      }
    });
    setWars(detectedWars);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();

    const channel = supabase
      .channel("monitor-bids")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bids" },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, supabase]);

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

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Monitor className="h-6 w-6 text-rocket-gold" />
        <div>
          <h1 className="font-display text-2xl font-bold text-rocket-text">
            Live Monitor
          </h1>
          <p className="text-sm text-rocket-muted mt-1">
            Real-time auction activity &amp; threat detection
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Active Auctions */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-rocket-text uppercase tracking-wider">
            <Clock size={14} className="text-rocket-teal" />
            Active Auctions ({activeAuctions.length})
          </h2>
          {activeAuctions.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-rocket-muted py-4">
                No active auctions
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {activeAuctions.map((auction) => (
                <LiveAuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Bids Feed */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-rocket-text uppercase tracking-wider">
            <Crosshair size={14} className="text-rocket-gold" />
            Live Bid Feed
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {recentBids.length === 0 ? (
              <Card>
                <p className="text-center text-sm text-rocket-muted py-4">
                  No bids yet
                </p>
              </Card>
            ) : (
              recentBids.map((bid, idx) => {
                const auctionTitle =
                  activeAuctions.find((a) => a.id === bid.auction_id)?.title ??
                  "Unknown";
                const isWar = wars.some(
                  (w) =>
                    w.auctionId === bid.auction_id &&
                    w.users.includes(bid.bidder_id),
                );

                return (
                  <motion.div
                    key={bid.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className={`rounded-lg border p-3 ${
                      isWar
                        ? "border-rocket-danger/40 bg-rocket-danger/5 animate-pulse-war"
                        : "border-rocket-border bg-rocket-bg"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-rocket-muted truncate">
                          {auctionTitle}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-sm font-semibold text-rocket-gold">
                            {bid.amount} cr
                          </span>
                          {isWar && (
                            <Badge variant="danger">
                              <Swords size={10} className="mr-1" />
                              WAR
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-rocket-dim whitespace-nowrap">
                        {formatDistanceToNow(bid.created_at)}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Sniper Radar */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-rocket-text uppercase tracking-wider">
            <Crosshair size={14} className="text-rocket-danger" />
            Sniper Radar
          </h2>
          {snipers.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-rocket-muted py-4">
                No snipers detected
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {snipers.map((sniper) => (
                <SniperAlert
                  key={sniper.userId}
                  userId={sniper.userId}
                  userName={sniper.userName}
                  lastSecondBids={sniper.lastSecondBids}
                  lastBidTime={sniper.lastBidTime}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
