"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Gavel, Eye } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useCountdown } from "@/lib/hooks/useCountdown";
import type { Auction } from "@/lib/hooks/useAuctions";

interface AuctionCardProps {
  auction: Auction;
  linkPrefix?: string;
}

export function AuctionCard({
  auction,
  linkPrefix = "/bidder/auctions",
}: AuctionCardProps) {
  // Always call both hooks (rules of hooks) — pick the right one based on status
  const endCountdown = useCountdown(auction.end_time);
  const startCountdown = useCountdown(auction.start_time);

  const isUpcoming = auction.status === "upcoming";
  const { timeLeft, isUrgent } = isUpcoming ? startCountdown : endCountdown;
  const isBlindLive = auction.blind_mode && auction.status !== "closed";
  const blindBidCount = auction.bids?.[0]?.count ?? 0;

  const statusBadge = {
    active: <Badge variant="teal">Live</Badge>,
    closed: <Badge variant="muted">Closed</Badge>,
    upcoming: <Badge variant="gold">Upcoming</Badge>,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Link href={`${linkPrefix}/${auction.id}`}>
        <div className="group rounded-xl border border-rocket-border bg-rocket-card overflow-hidden hover:border-rocket-gold/30 transition-colors">
          {auction.image_url ? (
            <div className="aspect-video bg-rocket-bg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={auction.image_url}
                alt={auction.title}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
          ) : (
            <div className="aspect-video bg-gradient-to-br from-rocket-gold/10 to-rocket-teal/10 flex items-center justify-center">
              <Gavel className="h-10 w-10 text-rocket-dim" />
            </div>
          )}

          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display font-semibold text-rocket-text line-clamp-1 group-hover:text-rocket-gold transition-colors">
                {auction.title}
              </h3>
              {statusBadge[auction.status]}
            </div>

            <p className="text-sm text-rocket-muted line-clamp-2">
              {auction.description || "No description provided."}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-rocket-border">
              <div className="flex items-center gap-1.5">
                <Gavel size={14} className="text-rocket-gold" />
                <span className="font-mono text-sm font-semibold text-rocket-gold">
                  {isBlindLive
                    ? `${blindBidCount} bid${blindBidCount === 1 ? "" : "s"}`
                    : isUpcoming
                      ? `From ${auction.min_bid} cr`
                      : `${auction.current_bid || auction.min_bid} cr`}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock
                  size={14}
                  className={
                    !isUpcoming && isUrgent
                      ? "text-rocket-danger"
                      : "text-rocket-muted"
                  }
                />
                <span
                  className={`font-mono text-sm ${
                    !isUpcoming && isUrgent
                      ? "text-rocket-danger font-semibold"
                      : "text-rocket-muted"
                  }`}
                >
                  {isUpcoming ? `Starts in ${timeLeft}` : timeLeft}
                </span>
              </div>
            </div>

            {auction.blind_mode && (
              <div className="flex items-center gap-1.5 text-xs text-rocket-muted">
                <Eye size={12} />
                Blind mode — bids hidden until close
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
