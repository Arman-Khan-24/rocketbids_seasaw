"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Clock, Gavel, Trophy, Eye, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuction } from "@/lib/hooks/useAuctions";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { useUser } from "@/lib/hooks/useUser";
import { BidForm } from "@/components/auction/BidForm";
import { BidSuggestions } from "@/components/auction/BidSuggestions";
import { BidList } from "@/components/auction/BidList";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import {
  useReactionToast,
  type ReactionScenario,
} from "@/components/shared/ReactionToast";
import { formatDate } from "@/lib/utils";

export default function AuctionDetailPage() {
  const params = useParams();
  const auctionId = params.id as string;
  const { auction, bids, loading } = useAuction(auctionId);
  const { user, profile } = useUser();

  if (loading || !auction) return <PageLoader />;

  return (
    <AuctionDetail
      auction={auction}
      bids={bids}
      userId={user?.id}
      creditBalance={profile?.credits ?? 0}
    />
  );
}

function AuctionDetail({
  auction,
  bids,
  userId,
  creditBalance,
}: {
  auction: NonNullable<ReturnType<typeof useAuction>["auction"]>;
  bids: ReturnType<typeof useAuction>["bids"];
  userId?: string;
  creditBalance: number;
}) {
  const { timeLeft, isUrgent, isExpired } = useCountdown(auction.end_time);
  const isWinner = auction.current_winner_id === userId;
  const { triggerReaction } = useReactionToast();
  const isBlindLive = auction.blind_mode && auction.status !== "closed";

  const [bidAmount, setBidAmount] = useState("");
  const [showAntiSnipeBanner, setShowAntiSnipeBanner] = useState(false);

  // War mode: same two bidders alternate at least 3 exchanges within 60 seconds.
  const now = Date.now();
  const recentBids = [...bids]
    .filter((b) => now - new Date(b.created_at).getTime() <= 60000)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const pairExchangeMap: Record<
    string,
    { exchanges: number; lastExchange: number }
  > = {};
  for (let i = 1; i < recentBids.length; i++) {
    const prev = recentBids[i - 1];
    const curr = recentBids[i];
    if (prev.bidder_id === curr.bidder_id) continue;

    const pairKey = [prev.bidder_id, curr.bidder_id].sort().join("::");
    const exchangeAt = new Date(curr.created_at).getTime();

    if (!pairExchangeMap[pairKey]) {
      pairExchangeMap[pairKey] = { exchanges: 0, lastExchange: exchangeAt };
    }

    pairExchangeMap[pairKey].exchanges += 1;
    pairExchangeMap[pairKey].lastExchange = exchangeAt;
  }

  const isWarMode = Object.values(pairExchangeMap).some(
    (pair) => pair.exchanges >= 3 && now - pair.lastExchange <= 60000,
  );

  const didInitReactionRef = useRef(false);
  const prevStatusRef = useRef(auction.status);
  const prevWinnerRef = useRef(auction.current_winner_id);
  const prevEndTimeRef = useRef(auction.end_time);
  const prevBidCountRef = useRef(bids.length);
  const prevWarModeRef = useRef(isWarMode);

  useEffect(() => {
    if (!didInitReactionRef.current) {
      didInitReactionRef.current = true;
      prevStatusRef.current = auction.status;
      prevWinnerRef.current = auction.current_winner_id;
      prevEndTimeRef.current = auction.end_time;
      prevBidCountRef.current = bids.length;
      prevWarModeRef.current = isWarMode;
      return;
    }

    const prevStatus = prevStatusRef.current;
    const prevWinner = prevWinnerRef.current;
    const prevEndMs = new Date(prevEndTimeRef.current).getTime();
    const currEndMs = new Date(auction.end_time).getTime();
    const prevBidCount = prevBidCountRef.current;
    const prevWarMode = prevWarModeRef.current;

    let scenario: ReactionScenario | null = null;

    if (prevStatus !== "closed" && auction.status === "closed") {
      if (bids.length === 0) {
        scenario = "zero_bid_close";
      } else if (userId && auction.current_winner_id === userId) {
        scenario = "win_auction";
      } else if (userId && bids.some((b) => b.bidder_id === userId)) {
        scenario = "lose_auction";
      }
    } else if (
      userId &&
      prevWinner === userId &&
      auction.current_winner_id !== userId &&
      auction.current_winner_id !== null &&
      auction.status === "active"
    ) {
      scenario = "outbid";
    } else if (!prevWarMode && isWarMode) {
      scenario = "bidding_war";
    } else if (auction.status === "active" && currEndMs - prevEndMs >= 25_000) {
      scenario = "anti_snipe";
    } else if (prevBidCount === 0 && bids.length === 1) {
      scenario = "first_bid";
    }

    if (scenario) {
      triggerReaction(scenario);
      if (scenario === "anti_snipe") {
        setShowAntiSnipeBanner(true);
      }
    }

    prevStatusRef.current = auction.status;
    prevWinnerRef.current = auction.current_winner_id;
    prevEndTimeRef.current = auction.end_time;
    prevBidCountRef.current = bids.length;
    prevWarModeRef.current = isWarMode;
  }, [
    auction.status,
    auction.current_winner_id,
    auction.end_time,
    bids,
    isWarMode,
    triggerReaction,
    userId,
  ]);

  useEffect(() => {
    if (!showAntiSnipeBanner) return;

    const timer = setTimeout(() => {
      setShowAntiSnipeBanner(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [showAntiSnipeBanner]);

  return (
    <div className="space-y-6">
      <Link
        href="/bidder/browse"
        className="inline-flex items-center gap-2 text-sm text-rocket-muted hover:text-rocket-text transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Browse
      </Link>

      {isWarMode && (
        <motion.div
          key="war-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center justify-center gap-2 rounded-xl border border-rocket-danger/60 bg-rocket-danger/10 py-3 text-base font-bold text-rocket-danger animate-pulse"
        >
          🔥 Bidding War Active 🔥
        </motion.div>
      )}

      {showAntiSnipeBanner && (
        <motion.div
          key="anti-snipe-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center justify-center gap-2 rounded-xl border border-rocket-teal/60 bg-rocket-teal/10 py-3 text-base font-bold text-rocket-teal"
        >
          ⏰ Auction Extended by 30s
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <div className="order-1 lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl border bg-rocket-card overflow-hidden ${
              isWarMode
                ? "border-rocket-danger animate-pulse-war"
                : "border-rocket-border"
            }`}
          >
            {auction.image_url ? (
              <div className="aspect-video bg-rocket-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={auction.image_url}
                  alt={auction.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video bg-gradient-to-br from-rocket-gold/10 to-rocket-teal/10 flex items-center justify-center">
                <Gavel className="h-16 w-16 text-rocket-dim" />
              </div>
            )}

            <div className="p-4 md:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-rocket-text">
                    {auction.title}
                  </h1>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant={
                        auction.status === "active"
                          ? "teal"
                          : auction.status === "upcoming"
                            ? "gold"
                            : "muted"
                      }
                    >
                      {auction.status}
                    </Badge>
                    <Badge variant="muted">{auction.category}</Badge>
                    {auction.blind_mode && (
                      <Badge variant="gold">
                        <Eye size={10} className="mr-1" />
                        Blind
                      </Badge>
                    )}
                    {isWarMode && (
                      <Badge variant="danger">🔥 BIDDING WAR</Badge>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-rocket-muted text-sm leading-relaxed">
                {auction.description || "No description provided."}
              </p>

              <div className="grid grid-cols-1 gap-4 pt-4 border-t border-rocket-border sm:grid-cols-2">
                <div>
                  <p className="text-xs text-rocket-muted uppercase tracking-wider">
                    Current Bid
                  </p>
                  {isBlindLive ? (
                    <>
                      <p className="font-mono text-2xl font-bold text-rocket-dim mt-1">
                        Hidden
                      </p>
                      <p className="text-xs text-rocket-muted mt-1">
                        {bids.length} bid{bids.length === 1 ? "" : "s"} placed
                      </p>
                    </>
                  ) : (
                    <p className="font-mono text-2xl font-bold text-rocket-gold mt-1">
                      {auction.current_bid || auction.min_bid} cr
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-rocket-muted uppercase tracking-wider">
                    Time Left
                  </p>
                  <p
                    className={`font-mono text-2xl font-bold mt-1 flex items-center gap-2 ${
                      isUrgent ? "text-rocket-danger" : "text-rocket-text"
                    }`}
                  >
                    <Clock size={18} />
                    {timeLeft}
                  </p>
                </div>
              </div>

              {isWinner && auction.status === "closed" && (
                <motion.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-3 rounded-lg bg-rocket-teal/10 border border-rocket-teal/30 px-4 py-3"
                >
                  <Trophy className="h-5 w-5 text-rocket-teal" />
                  <span className="font-semibold text-rocket-teal">
                    You won this auction!
                  </span>
                </motion.div>
              )}

              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-rocket-muted">Min bid:&nbsp;</span>
                  <span className="font-mono text-rocket-text">
                    {auction.min_bid} cr
                  </span>
                </div>
                <div>
                  <span className="text-rocket-muted">Ends:&nbsp;</span>
                  <span className="text-rocket-text">
                    {formatDate(auction.end_time)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="order-2 space-y-4 lg:order-3">
          {auction.status === "active" && !isExpired && !isBlindLive && (
            <BidSuggestions
              bids={bids}
              currentBid={auction.current_bid}
              minBid={auction.min_bid}
              endTime={auction.end_time}
              warMode={isWarMode}
              creditBalance={creditBalance}
              onSelect={(n) => setBidAmount(String(n))}
            />
          )}
          <BidForm
            auctionId={auction.id}
            currentBid={auction.current_bid}
            minBid={auction.min_bid}
            status={auction.status}
            isExpired={isExpired}
            blindMode={isBlindLive}
            amount={bidAmount}
            onAmountChange={setBidAmount}
          />
        </div>

        <div className="order-3 space-y-3 lg:order-2 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold text-rocket-text">
            Bid History ({bids.length})
          </h2>
          {auction.blind_mode && auction.status === "active" ? (
            <div className="rounded-xl border border-rocket-border bg-rocket-card p-6 text-center md:p-8">
              <Eye className="h-8 w-8 text-rocket-dim mx-auto mb-2" />
              <p className="text-rocket-muted text-sm">
                Blind mode - bid history hidden until auction closes
              </p>
            </div>
          ) : (
            <BidList bids={bids} currentUserId={userId} />
          )}
        </div>
      </div>
    </div>
  );
}
