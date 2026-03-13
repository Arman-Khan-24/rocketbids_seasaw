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
  auctionTitle: string;
  users: { id: string; name: string }[];
  exchanges: number;
  lastExchangeAt: string;
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
    try {
      await fetch("/api/auctions/sync-status", { method: "PATCH" });
    } catch {
      // Non-critical background sync.
    }

    const oneMinuteAgoIso = new Date(Date.now() - 60_000).toISOString();

    const [auctionsRes, bidsRes, recentWindowBidsRes, snipeBidsRes] =
      await Promise.all([
        supabase
          .from("auctions")
          .select("*")
          .eq("status", "active")
          .order("end_time", { ascending: true }),
        supabase
          .from("bids")
          .select("id, auction_id, bidder_id, amount, created_at")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("bids")
          .select("auction_id, bidder_id, created_at")
          .gte("created_at", oneMinuteAgoIso)
          .order("created_at", { ascending: true }),
        supabase
          .from("bids")
          .select("bidder_id, created_at")
          .eq("is_snipe", true),
      ]);

    const auctions = (auctionsRes.data as Auction[]) ?? [];
    const bids = (bidsRes.data as LiveBid[]) ?? [];
    const windowBids =
      (recentWindowBidsRes.data as {
        auction_id: string;
        bidder_id: string;
        created_at: string;
      }[]) ?? [];

    const bidderIds = Array.from(
      new Set([
        ...bids.map((b) => b.bidder_id),
        ...windowBids.map((b) => b.bidder_id),
        ...((snipeBidsRes.data as { bidder_id: string }[] | null) ?? []).map(
          (b) => b.bidder_id,
        ),
      ]),
    );

    const profileMap: Record<string, string> = {};
    if (bidderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", bidderIds);

      (profiles ?? []).forEach((p) => {
        profileMap[p.id] = p.full_name || "Unknown";
      });
    }

    const auctionMap: Record<string, string> = {};
    auctions.forEach((a) => {
      auctionMap[a.id] = a.title;
    });

    const enrichedBids = bids
      .filter((bid) => Boolean(auctionMap[bid.auction_id]))
      .map((bid) => ({
        ...bid,
        bidder_name: profileMap[bid.bidder_id] ?? "Unknown",
        auction_title: auctionMap[bid.auction_id] ?? "Unknown",
      }));

    setActiveAuctions(auctions);
    setRecentBids(enrichedBids);

    // Detect snipers: users with 3+ bids flagged as snipes (is_snipe = true)
    const snipeBidsData =
      (snipeBidsRes.data as
        | { bidder_id: string; created_at: string }[]
        | null) ?? [];

    const sniperMap: Record<string, { count: number; lastBid: string }> = {};
    snipeBidsData.forEach((bid) => {
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
        userName: profileMap[userId] ?? "Unknown",
        lastSecondBids: data.count,
        lastBidTime: data.lastBid,
      }));
    setSnipers(detectedSnipers);

    // Detect bidding wars: same 2 users bid 3+ times in 60s on same auction
    const bidsByAuction: Record<
      string,
      { bidder_id: string; created_at: string }[]
    > = {};
    windowBids.forEach((bid) => {
      if (!bidsByAuction[bid.auction_id]) {
        bidsByAuction[bid.auction_id] = [];
      }
      bidsByAuction[bid.auction_id].push(bid);
    });

    const detectedWars: WarState[] = Object.entries(bidsByAuction)
      .map(([auctionId, auctionBids]) => {
        const sorted = [...auctionBids].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

        const pairMap: Record<
          string,
          { exchanges: number; users: [string, string]; lastExchange: number }
        > = {};

        for (let i = 1; i < sorted.length; i++) {
          const previous = sorted[i - 1];
          const current = sorted[i];
          if (previous.bidder_id === current.bidder_id) continue;

          const pairUsers = [previous.bidder_id, current.bidder_id].sort() as [
            string,
            string,
          ];
          const key = pairUsers.join("::");
          const exchangeAt = new Date(current.created_at).getTime();

          if (!pairMap[key]) {
            pairMap[key] = {
              exchanges: 0,
              users: pairUsers,
              lastExchange: exchangeAt,
            };
          }

          pairMap[key].exchanges += 1;
          pairMap[key].lastExchange = exchangeAt;
        }

        const hottestPair = Object.values(pairMap)
          .filter(
            (pair) =>
              pair.exchanges >= 3 && Date.now() - pair.lastExchange <= 60000,
          )
          .sort((a, b) => b.exchanges - a.exchanges)[0];

        if (!hottestPair) {
          return null;
        }

        return {
          auctionId,
          auctionTitle: auctionMap[auctionId] ?? "Unknown",
          users: hottestPair.users.map((id) => ({
            id,
            name: profileMap[id] ?? "Unknown",
          })),
          exchanges: hottestPair.exchanges,
          lastExchangeAt: new Date(hottestPair.lastExchange).toISOString(),
        };
      })
      .filter((war): war is WarState => war !== null);

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
    const interval = setInterval(() => {
      void fetchData();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData]);

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
                const auctionTitle = bid.auction_title ?? "Unknown";
                const isWar = wars.some(
                  (w) =>
                    w.auctionId === bid.auction_id &&
                    w.users.some((user) => user.id === bid.bidder_id),
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
                        <p className="text-xs text-rocket-dim truncate">
                          {bid.bidder_name ?? "Unknown"}
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

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-rocket-text uppercase tracking-wider">
          <Swords size={14} className="text-rocket-danger" />
          War Mode ({wars.length})
        </h2>
        {wars.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-rocket-muted py-4">
              No active bidding wars
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {wars.map((war) => (
              <div
                key={war.auctionId}
                className="rounded-lg border border-rocket-danger/40 bg-rocket-danger/5 p-3"
              >
                <p className="text-sm font-semibold text-rocket-text">
                  {war.auctionTitle}
                </p>
                <p className="text-xs text-rocket-muted mt-1">
                  {war.users.map((u) => u.name).join(" vs ")} • {war.exchanges}{" "}
                  exchanges
                </p>
                <p className="text-xs text-rocket-dim mt-1">
                  Last exchange {formatDistanceToNow(war.lastExchangeAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
