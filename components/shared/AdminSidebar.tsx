"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gavel,
  Users,
  Monitor,
  BarChart3,
} from "lucide-react";

const adminLinks = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/auctions", label: "Auctions", icon: Gavel },
  { href: "/admin/bidders", label: "Bidders", icon: Users },
  { href: "/admin/monitor", label: "Live Monitor", icon: Monitor },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-14 z-20 h-[calc(100vh-3.5rem)] w-56 border-r border-rocket-border bg-rocket-bg overflow-y-auto">
      <nav className="flex flex-col gap-1 p-3">
        {adminLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-rocket-gold/10 text-rocket-gold font-medium"
                  : "text-rocket-muted hover:text-rocket-text hover:bg-rocket-card"
              }`}
            >
              <Icon size={18} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
