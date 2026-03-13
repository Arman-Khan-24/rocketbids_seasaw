"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronRight,
  Gavel,
  LayoutDashboard,
  LogOut,
  Monitor,
  Rocket,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

interface Profile {
  id: string;
  full_name: string | null;
  role: "admin" | "bidder";
}

function resolveRole(value: unknown): "admin" | "bidder" {
  return value === "admin" ? "admin" : "bidder";
}

const adminLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/auctions", label: "Auctions", icon: Gavel },
  { href: "/admin/bidders", label: "Bidders", icon: Users },
  { href: "/admin/monitor", label: "Live Monitor", icon: Monitor },
  { href: "/admin/winners", label: "Winners", icon: Trophy },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tabletExpanded, setTabletExpanded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function verifyAdminRole() {
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
        .select("id, full_name, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn(
          "Unable to read profile in admin layout. Falling back to metadata.",
          profileError,
        );
      }

      const resolvedRole =
        profileData?.role === "admin" || profileData?.role === "bidder"
          ? profileData.role
          : resolveRole(user.user_metadata?.role);

      if (resolvedRole !== "admin") {
        router.replace(resolvedRole === "bidder" ? "/bidder/browse" : "/login");
        return;
      }

      if (isMounted) {
        setProfile({
          id: user.id,
          full_name:
            profileData?.full_name || user.user_metadata?.full_name || "Admin",
          role: "admin",
        });
        setChecking(false);
      }
    }

    verifyAdminRole();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

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

  const mobileNavLinks = adminLinks.filter((link) =>
    ["/admin/dashboard", "/admin/auctions", "/admin/bidders", "/admin/monitor"].includes(
      link.href,
    ),
  );

  if (checking) {
    return (
      <div className="min-h-screen bg-rocket-bg p-4 md:p-6 md:pl-16 lg:pl-[220px]">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-rocket-card" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rocket-bg text-rocket-text">
      <aside
        className={`group fixed left-0 top-0 z-40 hidden h-screen border-r border-rocket-border bg-rocket-card transition-all duration-200 md:flex md:w-16 md:hover:w-[220px] lg:w-[220px] ${tabletExpanded ? "md:w-[220px]" : ""}`}
      >
        <div className="flex h-full flex-col p-4">
          <div className="space-y-3">
            <button
              onClick={() => setTabletExpanded((prev) => !prev)}
              className="hidden md:flex lg:hidden h-11 w-11 items-center justify-center rounded-lg border border-rocket-border text-rocket-muted hover:text-rocket-text"
            >
              <ChevronRight
                size={16}
                className={`transition-transform ${tabletExpanded ? "rotate-180" : ""}`}
              />
            </button>
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-rocket-gold" />
              <span
                className={`font-display text-lg font-bold text-rocket-text ${tabletExpanded ? "md:inline" : "md:hidden group-hover:inline"} lg:inline`}
              >
                RocketBids
              </span>
            </Link>
            <span
              className={`inline-flex rounded-full border border-rocket-gold/30 bg-rocket-gold/15 px-2 py-0.5 text-xs font-semibold text-rocket-gold ${tabletExpanded ? "md:inline-flex" : "md:hidden group-hover:inline-flex"} lg:inline-flex`}
            >
              ADMIN
            </span>
            {profile?.full_name && (
              <p
                className={`truncate text-xs text-rocket-muted ${tabletExpanded ? "md:block" : "md:hidden group-hover:block"} lg:block`}
              >
                {profile.full_name}
              </p>
            )}
          </div>

          <nav className="mt-6 flex flex-1 flex-col gap-1">
            {adminLinks.map((link) => {
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
                  } ${tabletExpanded ? "md:justify-start" : "md:justify-center group-hover:justify-start"} lg:justify-start`}
                >
                  <Icon size={16} />
                  <span
                    className={`${tabletExpanded ? "md:inline" : "md:hidden group-hover:inline"} lg:inline`}
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-rocket-border pt-4">
            <div className={`${tabletExpanded ? "md:block" : "md:hidden group-hover:block"} lg:block`}>
              <ThemeToggle />
            </div>
            <button
              onClick={handleLogout}
              className={`flex w-full items-center rounded-lg border border-rocket-border px-3 py-2 text-sm text-rocket-muted transition-all hover:bg-rocket-bg hover:text-rocket-danger ${tabletExpanded ? "md:justify-start gap-2" : "md:justify-center group-hover:justify-start group-hover:gap-2"} lg:justify-start lg:gap-2`}
            >
              <LogOut size={15} />
              <span
                className={`${tabletExpanded ? "md:inline" : "md:hidden group-hover:inline"} lg:inline`}
              >
                Log out
              </span>
            </button>
          </div>
        </div>
      </aside>

      <main className="pb-20 md:pb-0 md:pl-16 lg:pl-[220px]">
        <div className="p-4 md:p-6">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-rocket-border bg-rocket-card px-2 py-2 md:hidden">
        <div className="grid grid-cols-4 gap-1">
          {mobileNavLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg text-[11px] font-medium ${
                  isActive
                    ? "text-rocket-gold"
                    : "text-rocket-muted hover:text-rocket-text"
                }`}
              >
                <Icon size={16} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
