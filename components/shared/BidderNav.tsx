"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, History, UserCircle } from "lucide-react";

const bidderLinks = [
  { href: "/bidder/browse", label: "Browse Auctions", icon: Search },
  { href: "/bidder/history", label: "Bid History", icon: History },
  { href: "/bidder/account", label: "My Account", icon: UserCircle },
];

export function BidderNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-rocket-border bg-rocket-bg">
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 overflow-x-auto">
        {bidderLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? "border-rocket-gold text-rocket-gold font-medium"
                  : "border-transparent text-rocket-muted hover:text-rocket-text"
              }`}
            >
              <Icon size={16} />
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
