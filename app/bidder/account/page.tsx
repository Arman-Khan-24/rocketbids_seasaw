"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, CreditCard, Gavel, UserCircle, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatCredits } from "@/lib/utils";

type TabKey = "overview" | "bids" | "credits";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "bidder";
  credits: number | null;
  reserved_credits: number | null;
  created_at: string;
}

interface AuctionSummary {
  title: string | null;
  status: "active" | "closed" | "upcoming" | null;
  current_winner_id: string | null;
  current_bid: number;
}

interface BidRecord {
  id: string;
  auction_id: string;
  amount: number;
  created_at: string;
  auctions: AuctionSummary | null;
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  created_at: string;
}

type BadgeVariant = "gold" | "teal" | "danger" | "muted";

interface BidStatus {
  label: string;
  variant: BadgeVariant;
}

type TxVariant = BadgeVariant | "purple";

interface TxMeta {
  label: string;
  variant: TxVariant;
  prefix: "+" | "-";
  amountClass: string;
}

function AccountSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse rounded-xl border border-rocket-border bg-rocket-card p-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-rocket-border" />
          <div className="space-y-2">
            <div className="h-4 w-40 rounded bg-rocket-border" />
            <div className="h-3 w-56 rounded bg-rocket-border" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="h-20 rounded-lg bg-rocket-border" />
          <div className="h-20 rounded-lg bg-rocket-border" />
          <div className="h-20 rounded-lg bg-rocket-border" />
        </div>
      </div>

      <div className="animate-pulse rounded-xl border border-rocket-border bg-rocket-card p-6">
        <div className="h-5 w-32 rounded bg-rocket-border" />
        <div className="mt-4 space-y-3">
          <div className="h-12 rounded bg-rocket-border" />
          <div className="h-12 rounded bg-rocket-border" />
          <div className="h-12 rounded bg-rocket-border" />
        </div>
      </div>
    </div>
  );
}

function getBidStatus(bid: BidRecord, profileId: string): BidStatus {
  const auction = bid.auctions;
  const isExactWinningBid =
    auction?.current_winner_id === profileId &&
    bid.amount === (auction?.current_bid ?? -1);

  if (auction?.status === "closed") {
    return isExactWinningBid
      ? { label: "won", variant: "teal" }
      : { label: "lost", variant: "muted" };
  }

  if (auction?.status === "active") {
    return isExactWinningBid
      ? { label: "winning", variant: "teal" }
      : { label: "outbid", variant: "danger" };
  }

  return { label: "upcoming", variant: "gold" };
}

function getTransactionMeta(rawType: string): TxMeta {
  const type = rawType.toLowerCase();

  if (type === "assigned" || type === "assign") {
    return {
      label: "assigned",
      variant: "teal",
      prefix: "+",
      amountClass: "text-rocket-teal",
    };
  }

  if (type === "bid_deduct") {
    return {
      label: "reserved",
      variant: "gold",
      prefix: "-",
      amountClass: "text-rocket-gold",
    };
  }

  if (type === "winner_deduct" || type === "deducted") {
    return {
      label: "deducted",
      variant: "danger",
      prefix: "-",
      amountClass: "text-rocket-danger",
    };
  }

  if (type === "bid_refund") {
    return {
      label: "released",
      variant: "teal",
      prefix: "+",
      amountClass: "text-rocket-teal",
    };
  }

  if (type === "returned") {
    return {
      label: "returned",
      variant: "gold",
      prefix: "+",
      amountClass: "text-rocket-gold",
    };
  }

  if (type === "mining") {
    return {
      label: "mining",
      variant: "purple",
      prefix: "+",
      amountClass: "text-purple-400",
    };
  }

  return {
    label: type,
    variant: "muted",
    prefix: "+",
    amountClass: "text-rocket-muted",
  };
}

export default function BidderAccountPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<TabKey>("overview");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        if (isMounted) {
          setEmail(session.user.email ?? "");
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profileError) throw profileError;

        if (!profileData) {
          throw new Error("Profile not found");
        }

        if (profileData.role !== "bidder") {
          router.replace("/admin/dashboard");
          return;
        }

        if (isMounted) {
          setProfile(profileData as Profile);
        }

        const { data: bidsData, error: bidsError } = await supabase
          .from("bids")
          .select(
            `
            *,
            auctions (
              title,
              status,
              current_winner_id,
              current_bid
            )
          `,
          )
          .eq("bidder_id", session.user.id)
          .order("created_at", { ascending: false });

        if (bidsError) throw bidsError;

        if (isMounted) {
          setBids((bidsData as BidRecord[] | null) || []);
        }

        const { data: txData, error: txError } = await supabase
          .from("credit_transactions")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false });

        if (txError) throw txError;

        if (isMounted) {
          setTransactions((txData as CreditTransaction[] | null) || []);
        }
      } catch (err) {
        if (isMounted) {
          setError("Failed to load account data.");
        }
        console.error(err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  const displayName = profile?.full_name?.trim() || "Bidder";
  const initials = useMemo(() => {
    const parts = displayName.split(" ").filter(Boolean);
    const first = parts[0]?.[0] ?? "B";
    const second = parts[1]?.[0] ?? "";
    return `${first}${second}`.toUpperCase();
  }, [displayName]);

  const wins = useMemo(() => {
    if (!profile) return 0;

    const wonAuctionIds = new Set<string>();
    bids.forEach((bid) => {
      if (
        bid.auctions?.status === "closed" &&
        bid.auctions.current_winner_id === profile.id
      ) {
        wonAuctionIds.add(bid.auction_id);
      }
    });

    return wonAuctionIds.size;
  }, [bids, profile]);

  if (loading) return <AccountSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border border-rocket-danger/30 bg-rocket-danger/10 p-6 text-center">
        <p className="text-sm text-rocket-text">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border border-rocket-border px-4 py-2 text-sm text-rocket-muted transition-colors hover:bg-rocket-card hover:text-rocket-text"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-xl border border-rocket-border bg-rocket-card p-6 text-center text-sm text-rocket-muted">
        Failed to load account data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-rocket-border bg-rocket-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rocket-gold font-display text-lg font-bold text-rocket-bg">
            {initials}
          </div>

          <div className="space-y-0.5">
            <h1 className="font-display text-2xl font-bold text-rocket-text">
              {displayName}
            </h1>
            <p className="text-sm text-rocket-muted">
              {email || profile.email || "No email"}
            </p>
            <p className="text-xs text-rocket-dim">
              Joined {formatDate(profile.created_at)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-rocket-border bg-rocket-bg px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-rocket-muted">
              Available Credits
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-rocket-gold">
              {formatCredits(profile.credits ?? 0)}
            </p>
            <p className="mt-1 text-xs text-rocket-dim">
              On hold: {formatCredits(profile.reserved_credits ?? 0)} cr
            </p>
          </div>

          <div className="rounded-lg border border-rocket-border bg-rocket-bg px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-rocket-muted">
              Total Bids
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-rocket-text">
              {formatCredits(bids.length)}
            </p>
          </div>

          <div className="rounded-lg border border-rocket-border bg-rocket-bg px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-rocket-muted">
              Wins
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-rocket-teal">
              {formatCredits(wins)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-rocket-border">
        <button
          onClick={() => setTab("overview")}
          className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
            tab === "overview"
              ? "border-rocket-gold text-rocket-gold font-medium"
              : "border-transparent text-rocket-muted hover:text-rocket-text"
          }`}
        >
          <UserCircle size={14} className="mr-1.5 inline" />
          Overview
        </button>
        <button
          onClick={() => setTab("bids")}
          className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
            tab === "bids"
              ? "border-rocket-gold text-rocket-gold font-medium"
              : "border-transparent text-rocket-muted hover:text-rocket-text"
          }`}
        >
          <Gavel size={14} className="mr-1.5 inline" />
          Bid History
        </button>
        <button
          onClick={() => setTab("credits")}
          className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
            tab === "credits"
              ? "border-rocket-gold text-rocket-gold font-medium"
              : "border-transparent text-rocket-muted hover:text-rocket-text"
          }`}
        >
          <CreditCard size={14} className="mr-1.5 inline" />
          Credit Log
        </button>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-rocket-border bg-rocket-card p-5">
            <p className="text-sm font-semibold text-rocket-text">Latest Bid</p>
            {bids[0] ? (
              <div className="mt-3 space-y-1">
                <p className="text-sm text-rocket-text">
                  {bids[0].auctions?.title || "Untitled auction"}
                </p>
                <p className="font-mono text-sm text-rocket-gold">
                  {formatCredits(bids[0].amount)} cr
                </p>
                <p className="text-xs text-rocket-dim">
                  {formatDate(bids[0].created_at)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-rocket-muted">
                You haven&apos;t placed any bids yet
              </p>
            )}
          </div>

          <div className="rounded-xl border border-rocket-border bg-rocket-card p-5">
            <p className="text-sm font-semibold text-rocket-text">
              Latest Credit Activity
            </p>
            {transactions[0] ? (
              <div className="mt-3 space-y-1">
                {(() => {
                  const meta = getTransactionMeta(transactions[0].type);
                  return (
                    <>
                      <p className="text-sm text-rocket-text capitalize">
                        {meta.label}
                      </p>
                      <p className={`font-mono text-sm ${meta.amountClass}`}>
                        {meta.prefix}
                        {formatCredits(Math.abs(transactions[0].amount))} cr
                      </p>
                      <p className="text-xs text-rocket-dim">
                        {formatDate(transactions[0].created_at)}
                      </p>
                    </>
                  );
                })()}
              </div>
            ) : (
              <p className="mt-3 text-sm text-rocket-muted">
                No credit transactions yet
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "bids" && (
        <div>
          {bids.length === 0 ? (
            <div className="rounded-xl border border-rocket-border bg-rocket-card p-12 text-center">
              <Gavel className="mx-auto mb-3 h-10 w-10 text-rocket-dim" />
              <p className="text-rocket-muted">
                You haven&apos;t placed any bids yet
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-rocket-border">
              <table className="w-full min-w-[680px]">
                <thead className="bg-rocket-card">
                  <tr className="border-b border-rocket-border">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Auction
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rocket-border bg-rocket-bg">
                  {bids.map((bid) => {
                    const status = getBidStatus(bid, profile.id);

                    return (
                      <tr key={bid.id}>
                        <td className="px-4 py-3 text-sm text-rocket-text">
                          {bid.auctions?.title || "Untitled auction"}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-rocket-gold">
                          {formatCredits(bid.amount)} cr
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={status.variant}
                            className="capitalize"
                          >
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-rocket-muted">
                          {formatDate(bid.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "credits" && (
        <div>
          {transactions.length === 0 ? (
            <div className="rounded-xl border border-rocket-border bg-rocket-card p-12 text-center">
              <Coins className="mx-auto mb-3 h-10 w-10 text-rocket-dim" />
              <p className="text-rocket-muted">No credit transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-rocket-border">
              <table className="w-full min-w-[760px]">
                <thead className="bg-rocket-card">
                  <tr className="border-b border-rocket-border">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Note
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-rocket-muted">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rocket-border bg-rocket-bg">
                  {transactions.map((tx) => {
                    const meta = getTransactionMeta(tx.type);

                    return (
                      <tr key={tx.id}>
                        <td className="px-4 py-3">
                          {meta.variant === "purple" ? (
                            <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2.5 py-0.5 text-xs font-medium text-purple-400 capitalize">
                              <Zap size={12} className="mr-1" />
                              {meta.label}
                            </span>
                          ) : (
                            <Badge
                              variant={meta.variant}
                              className="capitalize"
                            >
                              {meta.label}
                            </Badge>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 font-mono text-sm font-semibold ${meta.amountClass}`}
                        >
                          {meta.prefix}
                          {formatCredits(Math.abs(tx.amount))} cr
                        </td>
                        <td className="px-4 py-3 text-sm text-rocket-muted">
                          {tx.note || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-rocket-muted">
                          {formatDate(tx.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
