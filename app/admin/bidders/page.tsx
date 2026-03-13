"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users, Coins, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/shared/Toast";
import { formatCredits } from "@/lib/utils";

interface Bidder {
  id: string;
  full_name: string;
  credits: number;
  created_at: string;
  total_bids: number;
  total_wins: number;
  is_sniper: boolean;
}

export default function AdminBidders() {
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [filtered, setFiltered] = useState<Bidder[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBidder, setSelectedBidder] = useState<Bidder | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const supabase = useMemo(() => createClient(), []);
  const { addToast } = useToast();

  const fetchBidders = useCallback(async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, credits, created_at")
      .eq("role", "bidder")
      .order("created_at", { ascending: false });

    const { data: bidderBids } = await supabase
      .from("bids")
      .select("auction_id, bidder_id, is_snipe");

    const { data: closedAuctions } = await supabase
      .from("auctions")
      .select("id, current_winner_id")
      .eq("status", "closed");

    const bidCountMap: Record<string, number> = {};
    const snipeCountMap: Record<string, number> = {};

    (bidderBids ?? []).forEach((bid) => {
      bidCountMap[bid.bidder_id] = (bidCountMap[bid.bidder_id] || 0) + 1;
      if (bid.is_snipe) {
        snipeCountMap[bid.bidder_id] = (snipeCountMap[bid.bidder_id] || 0) + 1;
      }
    });

    const winCountMap: Record<string, number> = {};
    (closedAuctions ?? []).forEach((auction) => {
      if (!auction.current_winner_id) return;
      winCountMap[auction.current_winner_id] =
        (winCountMap[auction.current_winner_id] || 0) + 1;
    });

    const list: Bidder[] = (
      (profiles as
        | {
            id: string;
            full_name: string | null;
            credits: number;
            created_at: string;
          }[]
        | null) ?? []
    ).map((profile) => ({
      id: profile.id,
      full_name: profile.full_name || "Unnamed Bidder",
      credits: profile.credits ?? 0,
      created_at: profile.created_at,
      total_bids: bidCountMap[profile.id] || 0,
      total_wins: winCountMap[profile.id] || 0,
      is_sniper: (snipeCountMap[profile.id] || 0) >= 3,
    }));

    setBidders(list);
    setFiltered(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchBidders();
  }, [fetchBidders]);

  useEffect(() => {
    if (search.trim() === "") {
      setFiltered(bidders);
    } else {
      setFiltered(
        bidders.filter((b) =>
          b.full_name.toLowerCase().includes(search.toLowerCase()),
        ),
      );
    }
  }, [search, bidders]);

  function openAssignModal(bidder: Bidder) {
    setSelectedBidder(bidder);
    setCreditAmount("");
    setModalOpen(true);
  }

  async function assignCredits() {
    if (!selectedBidder) return;
    const amount = parseInt(creditAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      addToast("Enter a valid credit amount", "error");
      return;
    }

    const res = await fetch("/api/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: selectedBidder.id,
        amount,
        type: "assign",
        note: "Assigned by admin",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      addToast(data.error || "Failed to assign credits", "error");
    } else {
      addToast(
        `Assigned ${amount} credits to ${selectedBidder.full_name}`,
        "success",
      );
      setBidders((current) =>
        current.map((bidder) =>
          bidder.id === selectedBidder.id
            ? { ...bidder, credits: bidder.credits + amount }
            : bidder,
        ),
      );
      setFiltered((current) =>
        current.map((bidder) =>
          bidder.id === selectedBidder.id
            ? { ...bidder, credits: bidder.credits + amount }
            : bidder,
        ),
      );
      setModalOpen(false);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-rocket-text">
          Bidders
        </h1>
        <p className="text-sm text-rocket-muted mt-1">
          Manage bidder accounts and credits
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-rocket-dim"
        />
        <Input
          placeholder="Search bidders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-rocket-border bg-rocket-card p-12 text-center">
          <Users className="h-10 w-10 text-rocket-dim mx-auto mb-3" />
          <p className="text-rocket-muted">No bidders found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((bidder, idx) => (
            <motion.div
              key={bidder.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="rounded-xl border border-rocket-border bg-rocket-card p-4"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-rocket-text">
                    {bidder.full_name}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="gold">
                    <Coins size={10} className="mr-1" />
                    {formatCredits(bidder.credits)} cr
                  </Badge>
                  {bidder.is_sniper && <Badge variant="danger">Sniper</Badge>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-rocket-border bg-rocket-bg px-2 py-1.5">
                  <p className="text-rocket-dim">Total bids</p>
                  <p className="font-mono text-rocket-text mt-0.5">
                    {formatCredits(bidder.total_bids)}
                  </p>
                </div>
                <div className="rounded-md border border-rocket-border bg-rocket-bg px-2 py-1.5">
                  <p className="text-rocket-dim">Wins</p>
                  <p className="font-mono text-rocket-teal mt-0.5">
                    {formatCredits(bidder.total_wins)}
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-rocket-border">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openAssignModal(bidder)}
                  className="w-full"
                >
                  <Coins size={14} className="mr-1.5" />
                  Assign Credits
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Assign Credits"
      >
        {selectedBidder && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-rocket-text">
                Assigning credits to{" "}
                <span className="font-semibold text-rocket-gold">
                  {selectedBidder.full_name}
                </span>
              </p>
              <p className="text-xs text-rocket-muted mt-1">
                Current balance:{" "}
                <span className="font-mono text-rocket-gold">
                  {formatCredits(selectedBidder.credits)} cr
                </span>
              </p>
            </div>
            <Input
              type="number"
              label="Credits to assign"
              placeholder="100"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              min="1"
              className="font-mono"
            />
            <div className="flex flex-col justify-end gap-3 sm:flex-row">
              <Button
                variant="secondary"
                onClick={() => setModalOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button onClick={assignCredits} className="w-full sm:w-auto">
                Assign
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
