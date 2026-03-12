"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rocket, LogOut, Sun, Moon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/useUser";
import { useState } from "react";

export function Navbar() {
  const { profile } = useUser();
  const router = useRouter();
  const supabase = createClient();
  const [darkMode, setDarkMode] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function toggleTheme() {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  }

  const homeLink =
    profile?.role === "admin" ? "/admin/dashboard" : "/bidder/browse";

  return (
    <nav className="sticky top-0 z-30 border-b border-rocket-border bg-rocket-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href={homeLink} className="flex items-center gap-2 group">
          <Rocket className="h-5 w-5 text-rocket-gold group-hover:rotate-12 transition-transform" />
          <span className="font-display text-lg font-bold text-rocket-text">
            RocketBids
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {profile && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-rocket-muted">{profile.full_name}</span>
              {profile.role === "bidder" && (
                <span className="font-mono text-rocket-gold font-semibold">
                  {profile.credits} cr
                </span>
              )}
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="p-2 text-rocket-muted hover:text-rocket-text transition-colors"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-rocket-muted hover:text-rocket-danger transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
