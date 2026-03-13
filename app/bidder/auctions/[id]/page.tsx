"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Clock, Gavel, Trophy, Eye, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuction } from "@/lib/hooks/useAuctions";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { useUser } from "@/lib/hooks/useUser";
import { BidForm } from "@/components/auction/BidForm";
import { BidList } from "@/components/auction/BidList";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";

export default function AuctionDetailPage() {
  const params = useParams();
  const auctionId = params.id as string;
  const { auction, bids, loading } = useAuction(auctionId);
  const { user } = useUser();

  if (loading || !auction) return <PageLoader />;

  return <AuctionDetail auction={auction} bids={bids} userId={user?.id} />;
}

function AuctionDetail({
  auction,
  bids,
  userId,
}: {
  auction: NonNullable<ReturnType<typeof useAuction>["auction"]>;
  bids: ReturnType<typeof useAuction>["bids"];
  userId?: string;
}) {
  const { timeLeft, isUrgent, isExpired } = useCountdown(auction.end_time);
  const isWinner = auction.current_winner_id === userId;

  // Detect bidding war: check if 2 users have 3+ bids each in the last 60 seconds
  const now = Date.now();
  const recentBids = bids.filter(
    (b) => now - new Date(b.created_at).getTime() <= 60000,
  );
  const bidderCounts: Record<string, number> = {};
  recentBids.forEach((b) => {
    bidderCounts[b.bidder_id] = (bidderCounts[b.bidder_id] || 0) + 1;
  });
  const warParticipants = Object.values(bidderCounts).filter((c) => c >= 3);
  const isWarMode = warParticipants.length >= 2;

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
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

            <div className="p-6 space-y-4">
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

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-rocket-border">
                <div>
                  <p className="text-xs text-rocket-muted uppercase tracking-wider">
                    Current Bid
                  </p>
                  <p className="font-mono text-2xl font-bold text-rocket-gold mt-1">
                    {auction.current_bid || auction.min_bid} cr
                  </p>
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

              <div className="grid grid-cols-2 gap-4 text-sm">
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

          {/* Bid History */}
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-rocket-text">
              Bid History ({bids.length})
            </h2>
            {auction.blind_mode && auction.status === "active" ? (
              <div className="rounded-xl border border-rocket-border bg-rocket-card p-8 text-center">
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

        {/* Sidebar */}
        <div className="space-y-4">
          <BidForm
            auctionId={auction.id}
            currentBid={auction.current_bid}
            minBid={auction.min_bid}
            status={auction.status}
            isExpired={isExpired}
          />
        </div>
      </div>
    </div>
  );
}
