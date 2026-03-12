"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Search, Gavel, UserCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { PageLoader } from "@/components/ui/Spinner";
import { formatDate, formatCredits } from "@/lib/utils";

interface WinnerRow {
  id: string;
  title: string;
  category: string;
  current_bid: number;
  end_time: string;
  image_url: string | null;
  winner_name: string | null;
  winner_id: string | null;
}

export default function AdminWinners() {
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const supabase = useMemo(() => createClient(), []);

  const fetchWinners = useCallback(async () => {
    // Sync statuses so closed auctions reflect correctly
    try {
      await fetch("/api/auctions/sync-status", { method: "PATCH" });
    } catch {
      // Non-critical
    }

    const { data: auctions } = await supabase
      .from("auctions")
      .select(
        "id, title, category, current_bid, end_time, image_url, current_winner_id",
      )
      .eq("status", "closed")
      .order("end_time", { ascending: false });

    if (!auctions || auctions.length === 0) {
      setWinners([]);
      setLoading(false);
      return;
    }

    // Collect unique winner IDs (excluding nulls)
    const seen: Record<string, boolean> = {};
    const winnerIds = auctions
      .map((a) => a.current_winner_id)
      .filter((id): id is string => {
        if (!id || seen[id]) return false;
        seen[id] = true;
        return true;
      });

    // Fetch all winner profiles in one query
    const profileMap: Record<string, string> = {};
    if (winnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", winnerIds);

      (profiles ?? []).forEach((p) => {
        profileMap[p.id] = p.full_name ?? "Unknown";
      });
    }

    const rows: WinnerRow[] = auctions.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      current_bid: a.current_bid,
      end_time: a.end_time,
      image_url: a.image_url,
      winner_id: a.current_winner_id ?? null,
      winner_name: a.current_winner_id
        ? (profileMap[a.current_winner_id] ?? "Unknown")
        : null,
    }));

    setWinners(rows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchWinners();
  }, [fetchWinners]);

  const filtered = winners.filter((w) => {
    const q = search.toLowerCase();
    return (
      q === "" ||
      w.title.toLowerCase().includes(q) ||
      (w.winner_name ?? "").toLowerCase().includes(q) ||
      w.category.toLowerCase().includes(q)
    );
  });

  const withWinner = filtered.filter((w) => w.winner_id !== null);
  const noWinner = filtered.filter((w) => w.winner_id === null);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-rocket-text">
          Winners
        </h1>
        <p className="text-sm text-rocket-muted mt-1">
          All closed auctions and their winning bidders
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-rocket-dim"
        />
        <Input
          placeholder="Search by title, winner, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-rocket-border bg-rocket-card p-16 text-center"
        >
          <Trophy size={32} className="mx-auto text-rocket-dim mb-3" />
          <p className="text-rocket-muted text-sm">No closed auctions found</p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {/* ── With winners ── */}
          {withWinner.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-rocket-gold" />
                <h2 className="font-display text-base font-semibold text-rocket-text">
                  Won Auctions
                </h2>
                <span className="text-xs text-rocket-muted">
                  ({withWinner.length})
                </span>
              </div>

              <div className="rounded-xl border border-rocket-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rocket-border bg-rocket-bg">
                      <th className="text-left px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Auction
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Category
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Winner
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Winning Bid
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Closed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {withWinner.map((row, i) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-rocket-border last:border-0 hover:bg-rocket-bg/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {row.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.image_url}
                                alt={row.title}
                                className="h-9 w-9 rounded-md object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-md bg-rocket-gold/10 flex items-center justify-center shrink-0">
                                <Gavel size={14} className="text-rocket-gold" />
                              </div>
                            )}
                            <span className="font-medium text-rocket-text">
                              {row.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-rocket-muted">
                          {row.category}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <UserCircle
                              size={15}
                              className="text-rocket-teal shrink-0"
                            />
                            <span className="text-rocket-text">
                              {row.winner_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-rocket-gold">
                          {formatCredits(row.current_bid)} cr
                        </td>
                        <td className="px-4 py-3 text-right text-rocket-muted">
                          {formatDate(row.end_time)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── No winner (closed with 0 bids) ── */}
          {noWinner.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Gavel size={16} className="text-rocket-muted" />
                <h2 className="font-display text-base font-semibold text-rocket-text">
                  Closed — No Bids
                </h2>
                <span className="text-xs text-rocket-muted">
                  ({noWinner.length})
                </span>
              </div>

              <div className="rounded-xl border border-rocket-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rocket-border bg-rocket-bg">
                      <th className="text-left px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Auction
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Category
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-rocket-muted uppercase tracking-wide">
                        Closed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {noWinner.map((row, i) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-rocket-border last:border-0 hover:bg-rocket-bg/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {row.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.image_url}
                                alt={row.title}
                                className="h-9 w-9 rounded-md object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-md bg-rocket-gold/10 flex items-center justify-center shrink-0">
                                <Gavel size={14} className="text-rocket-gold" />
                              </div>
                            )}
                            <span className="font-medium text-rocket-text">
                              {row.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-rocket-muted">
                          {row.category}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="muted">No bids</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-rocket-muted">
                          {formatDate(row.end_time)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
