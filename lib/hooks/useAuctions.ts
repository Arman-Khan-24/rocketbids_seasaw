"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Auction {
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
}

export interface Bid {
  id: string;
  auction_id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
}

export function useAuctions(status?: string) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchAuctions = useCallback(async () => {
    // Sync stale auction statuses in DB before reading
    try {
      await fetch("/api/auctions/sync-status", { method: "PATCH" });
    } catch {
      // Non-critical — proceed with fetch regardless
    }

    let query = supabase
      .from("auctions")
      .select("*")
      .order("created_at", { ascending: false });
    if (status) {
      query = query.eq("status", status);
    }
    const { data } = await query;
    setAuctions((data as Auction[]) ?? []);
    setLoading(false);
  }, [status, supabase]);

  useEffect(() => {
    fetchAuctions();

    const channel = supabase
      .channel("auctions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auctions" },
        () => {
          fetchAuctions();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAuctions, supabase]);

  return { auctions, loading, refetch: fetchAuctions };
}

export function useAuction(id: string) {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchAuction = useCallback(async () => {
    // Sync stale auction status in DB before reading
    try {
      await fetch("/api/auctions/sync-status", { method: "PATCH" });
    } catch {
      // Non-critical — proceed with fetch regardless
    }

    const { data } = await supabase
      .from("auctions")
      .select("*")
      .eq("id", id)
      .single();
    setAuction(data as Auction | null);
    setLoading(false);
  }, [id, supabase]);

  const fetchBids = useCallback(async () => {
    const { data } = await supabase
      .from("bids")
      .select("*")
      .eq("auction_id", id)
      .order("created_at", { ascending: false });
    setBids((data as Bid[]) ?? []);
  }, [id, supabase]);

  useEffect(() => {
    fetchAuction();
    fetchBids();

    const auctionChannel = supabase
      .channel(`auction-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "auctions",
          filter: `id=eq.${id}`,
        },
        () => {
          fetchAuction();
        },
      )
      .subscribe();

    const bidsChannel = supabase
      .channel(`bids-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bids",
          filter: `auction_id=eq.${id}`,
        },
        () => {
          fetchBids();
          fetchAuction();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(auctionChannel);
      void supabase.removeChannel(bidsChannel);
    };
  }, [id, fetchAuction, fetchBids, supabase]);

  return {
    auction,
    bids,
    loading,
    refetchAuction: fetchAuction,
    refetchBids: fetchBids,
  };
}
