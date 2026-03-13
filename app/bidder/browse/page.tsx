"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Zap, Clock } from "lucide-react";
import { useAuctions, type Auction } from "@/lib/hooks/useAuctions";
import { AuctionCard } from "@/components/auction/AuctionCard";
import { Input } from "@/components/ui/Input";
import { PageLoader } from "@/components/ui/Spinner";

const categories = [
  "All",
  "General",
  "Electronics",
  "Art",
  "Collectibles",
  "Sports",
  "Fashion",
  "Books",
  "Other",
];

export default function BrowseAuctions() {
  // Fetch all auctions (no status filter) so we get both active and upcoming
  const { auctions, loading } = useAuctions();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const matchesFilter = (a: Auction) => {
    const matchSearch =
      search.trim() === "" ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "All" || a.category === category;
    return matchSearch && matchCategory;
  };

  const liveAuctions = auctions.filter(
    (a) => a.status === "active" && matchesFilter(a),
  );
  const upcomingAuctions = auctions.filter(
    (a) => a.status === "upcoming" && matchesFilter(a),
  );

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-rocket-text">
          Browse Auctions
        </h1>
        <p className="text-sm text-rocket-muted mt-1">
          Bid on live auctions or preview upcoming ones
        </p>
      </div>

      {/* Search + Category filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-rocket-dim"
          />
          <Input
            placeholder="Search auctions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <Filter size={14} className="text-rocket-muted shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors ${
                category === cat
                  ? "bg-rocket-gold/15 text-rocket-gold font-medium"
                  : "text-rocket-muted hover:text-rocket-text"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Live Auctions ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-rocket-teal" />
          <h2 className="font-display text-lg font-semibold text-rocket-text">
            Live Auctions
          </h2>
          <span className="text-xs text-rocket-muted ml-1">
            ({liveAuctions.length})
          </span>
        </div>

        {liveAuctions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-rocket-border bg-rocket-card p-10 text-center"
          >
            <p className="text-rocket-muted text-sm">
              No live auctions right now
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {liveAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </section>

      {/* ── Coming Soon ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-rocket-gold" />
          <h2 className="font-display text-lg font-semibold text-rocket-text">
            Coming Soon
          </h2>
          <span className="text-xs text-rocket-muted ml-1">
            ({upcomingAuctions.length})
          </span>
        </div>

        {upcomingAuctions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-rocket-border bg-rocket-card p-10 text-center"
          >
            <p className="text-rocket-muted text-sm">
              No upcoming auctions scheduled
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingAuctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
