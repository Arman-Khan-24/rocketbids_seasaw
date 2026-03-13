"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clock3,
  Coins,
  LogOut,
  Rocket,
  Search,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { formatCredits } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";

interface Profile {
  id: string;
  full_name: string | null;
  role: "admin" | "bidder";
  credits: number;
  reserved_credits: number;
}

function resolveRole(value: unknown): "admin" | "bidder" {
  return value === "admin" ? "admin" : "bidder";
}

const bidderLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/bidder/browse", label: "Browse Auctions", icon: Search },
  { href: "/bidder/history", label: "My Bids", icon: Clock3 },
  { href: "/bidder/account", label: "My Account", icon: UserCircle },
];

export default function BidderLayout({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    let isMounted = true;

    async function verifyBidderRole() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role, credits, reserved_credits")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn(
          "Unable to read profile in bidder layout. Falling back to metadata.",
          profileError,
        );
      }

      const resolvedRole =
        profileData?.role === "admin" || profileData?.role === "bidder"
          ? profileData.role
          : resolveRole(user.user_metadata?.role);

      if (resolvedRole !== "bidder") {
        router.replace(
          resolvedRole === "admin" ? "/admin/dashboard" : "/login",
        );
        return;
      }

      if (isMounted) {
        setProfile({
          id: user.id,
          full_name:
            profileData?.full_name || user.user_metadata?.full_name || "Bidder",
          role: "bidder",
          credits:
            typeof profileData?.credits === "number" ? profileData.credits : 0,
          reserved_credits:
            typeof profileData?.reserved_credits === "number"
              ? profileData.reserved_credits
              : 0,
        });
        setChecking(false);
      }
    }

    verifyBidderRole();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`profile-credits-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          const updated = payload.new as Partial<Profile>;
          setProfile((current) => {
            if (!current) return current;

            return {
              ...current,
              credits:
                typeof updated.credits === "number"
                  ? updated.credits
                  : current.credits,
              reserved_credits:
                typeof updated.reserved_credits === "number"
                  ? updated.reserved_credits
                  : current.reserved_credits,
              full_name:
                typeof updated.full_name === "string"
                  ? updated.full_name
                  : current.full_name,
            };
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, supabase]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`bidder-auction-events-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "auctions",
        },
        async (payload) => {
          const previous = payload.old as {
            id?: string;
            title?: string;
            status?: string;
            current_winner_id?: string | null;
          };
          const current = payload.new as {
            id?: string;
            title?: string;
            status?: string;
            current_winner_id?: string | null;
          };

          const auctionId = current.id;
          if (!auctionId) return;

          if (
            previous.current_winner_id === profile.id &&
            current.current_winner_id !== profile.id &&
            current.current_winner_id !== null &&
            current.status === "active"
          ) {
            addToast("You were outbid", "info");
          }

          if (previous.status !== "closed" && current.status === "closed") {
            if (current.current_winner_id === profile.id) {
              addToast(
                `You won ${current.title ? `\"${current.title}\"` : "an auction"}!`,
                "success",
              );
              return;
            }

            const { count } = await supabase
              .from("bids")
              .select("id", { count: "exact", head: true })
              .eq("auction_id", auctionId)
              .eq("bidder_id", profile.id);

            if ((count ?? 0) > 0) {
              addToast(
                `Auction closed: you lost ${current.title ? `\"${current.title}\"` : "this auction"}`,
                "error",
              );
            }
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, addToast, supabase]);

  useEffect(() => {
    const runStatusSync = async () => {
      try {
        await fetch("/api/auctions/sync-status", { method: "PATCH" });
      } catch {
        // Non-critical background refresh.
      }
    };

    void runStatusSync();
    const interval = setInterval(runStatusSync, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-rocket-bg pl-[220px] p-6">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-rocket-card" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rocket-bg text-rocket-text">
      <aside className="fixed left-0 top-0 h-screen w-[220px] border-r border-rocket-border bg-rocket-card">
        <div className="flex h-full flex-col p-4">
          <div className="space-y-3">
            <Link href="/bidder/browse" className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-rocket-gold" />
              <span className="font-display text-lg font-bold text-rocket-text">
                RocketBids
              </span>
            </Link>
            <span className="inline-flex rounded-full border border-rocket-teal/30 bg-rocket-teal/15 px-2 py-0.5 text-xs font-semibold text-rocket-teal">
              BIDDER
            </span>
            {profile?.full_name && (
              <p className="truncate text-xs text-rocket-muted">
                {profile.full_name}
              </p>
            )}
          </div>

          <nav className="mt-6 flex flex-1 flex-col gap-1">
            {bidderLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-rocket-gold/15 text-rocket-gold"
                      : "text-rocket-muted hover:bg-rocket-bg hover:text-rocket-text"
                  }`}
                >
                  <Icon size={16} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-rocket-border pt-4">
            <div className="rounded-lg border border-rocket-border bg-rocket-bg px-3 py-2">
              <p className="text-xs text-rocket-muted">Available Credits</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-semibold text-rocket-gold">
                <Coins size={13} />
                {formatCredits(profile?.credits ?? 0)} cr
              </p>
              <p className="mt-1 text-[11px] text-rocket-dim">
                On hold: {formatCredits(profile?.reserved_credits ?? 0)} cr
              </p>
            </div>

            <ThemeToggle />

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg border border-rocket-border px-3 py-2 text-sm text-rocket-muted transition-all hover:bg-rocket-bg hover:text-rocket-danger"
            >
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="pl-[220px]">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
