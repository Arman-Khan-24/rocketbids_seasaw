"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Award, Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/admin/StatCard";
import { PageLoader } from "@/components/ui/Spinner";
import { formatDate, formatCredits } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

interface AuctionReport {
  id: string;
  title: string;
  current_bid: number;
  status: string;
  bid_count: number;
  end_time: string;
}

interface BidPulsePoint {
  hour: string;
  bids: number;
}

interface BidTimestamp {
  created_at: string;
}

export default function AdminReports() {
  const [closedAuctions, setClosedAuctions] = useState<AuctionReport[]>([]);
  const [statusData, setStatusData] = useState<
    { name: string; value: number }[]
  >([]);
  const [bidPulseData, setBidPulseData] = useState<BidPulsePoint[]>([]);
  const [hasBidPulseBids, setHasBidPulseBids] = useState(false);
  const [creditFlow, setCreditFlow] = useState<
    { date: string; assigned: number; deducted: number }[]
  >([]);
  const [totalCreditsAssigned, setTotalCreditsAssigned] = useState(0);
  const [totalCreditsDeducted, setTotalCreditsDeducted] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function fetchReports() {
      // Sync auction statuses before reading so charts reflect the latest state
      try {
        await fetch("/api/auctions/sync-status", { method: "PATCH" });
      } catch {
        // Non-critical
      }

      const now = new Date();
      const pulseStart = new Date(now);
      pulseStart.setMinutes(0, 0, 0);
      pulseStart.setHours(pulseStart.getHours() - 23);
      const pulseEnd = new Date(pulseStart.getTime() + 24 * 60 * 60 * 1000);

      const [auctionsRes, bidsRes, creditsRes, pulseBidsRes] =
        await Promise.all([
          supabase.from("auctions").select("*"),
          supabase.from("bids").select("auction_id"),
          supabase
            .from("credit_transactions")
            .select("*")
            .order("created_at", { ascending: true }),
          supabase
            .from("bids")
            .select("created_at")
            .gte("created_at", pulseStart.toISOString())
            .lt("created_at", pulseEnd.toISOString())
            .order("created_at", { ascending: true }),
        ]);

      const auctions = auctionsRes.data ?? [];
      const bids = bidsRes.data ?? [];
      const credits = creditsRes.data ?? [];
      const pulseBids = (pulseBidsRes.data as BidTimestamp[]) ?? [];

      // Bid counts per auction
      const bidCounts: Record<string, number> = {};
      bids.forEach((b) => {
        bidCounts[b.auction_id] = (bidCounts[b.auction_id] || 0) + 1;
      });

      const reports: AuctionReport[] = auctions
        .filter((a) => a.status === "closed")
        .map((a) => ({
          id: a.id,
          title: a.title,
          current_bid: a.current_bid,
          status: a.status,
          bid_count: bidCounts[a.id] || 0,
          end_time: a.end_time,
        }))
        .sort(
          (a, b) =>
            new Date(b.end_time).getTime() - new Date(a.end_time).getTime(),
        );

      setClosedAuctions(reports);

      // Status distribution
      const statusCounts: Record<string, number> = {};
      auctions.forEach((a) => {
        statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
      });
      setStatusData(
        Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
      );

      // Credit flow
      let assigned = 0;
      let deducted = 0;
      const flowByDay: Record<string, { assigned: number; deducted: number }> =
        {};
      credits.forEach((c) => {
        const day = new Date(c.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        if (!flowByDay[day]) flowByDay[day] = { assigned: 0, deducted: 0 };
        if (c.type === "assign" || c.type === "mining") {
          flowByDay[day].assigned += c.amount;
          assigned += c.amount;
        } else {
          flowByDay[day].deducted += Math.abs(c.amount);
          deducted += Math.abs(c.amount);
        }
      });
      setCreditFlow(
        Object.entries(flowByDay).map(([date, data]) => ({
          date,
          ...data,
        })),
      );
      setTotalCreditsAssigned(assigned);
      setTotalCreditsDeducted(deducted);

      // Bid pulse for the last 24 hours (hourly buckets)
      const buckets = Array.from({ length: 24 }, (_, index) => {
        const bucketTime = new Date(
          pulseStart.getTime() + index * 60 * 60 * 1000,
        );
        return {
          bucketIso: bucketTime.toISOString(),
          hour: bucketTime.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          bids: 0,
        };
      });

      const bucketIndexByIso: Record<string, number> = {};
      buckets.forEach((bucket, index) => {
        bucketIndexByIso[bucket.bucketIso] = index;
      });

      pulseBids.forEach((bid) => {
        const hourStart = new Date(bid.created_at);
        hourStart.setMinutes(0, 0, 0);
        const index = bucketIndexByIso[hourStart.toISOString()];
        if (index !== undefined) {
          buckets[index].bids += 1;
        }
      });

      setBidPulseData(
        buckets.map(({ hour, bids: bidCount }) => ({
          hour,
          bids: bidCount,
        })),
      );
      setHasBidPulseBids(pulseBids.length > 0);

      setLoading(false);
    }

    void fetchReports();
  }, [supabase]);

  if (loading) return <PageLoader />;

  const COLORS = ["#00c9a7", "#f0a500", "#ff3d5a", "#8892a4"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-rocket-text">
          Reports
        </h1>
        <p className="text-sm text-rocket-muted mt-1">
          RocketBids analytics and insights
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Closed Auctions"
          value={closedAuctions.length}
          icon={Award}
          color="gold"
        />
        <StatCard
          title="Credits Assigned"
          value={formatCredits(totalCreditsAssigned)}
          icon={Coins}
          color="teal"
        />
        <StatCard
          title="Credits Deducted"
          value={formatCredits(totalCreditsDeducted)}
          icon={TrendingUp}
          color="danger"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Auction Status Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-rocket-border bg-rocket-card p-5"
        >
          <h2 className="font-display text-base font-semibold text-rocket-text mb-4">
            Auction Status Distribution
          </h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a0e1a",
                    border: "1px solid #1a2035",
                    borderRadius: "8px",
                    color: "#e8eaf0",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", color: "#8892a4" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-12 text-rocket-muted text-sm">
              No data
            </p>
          )}
        </motion.div>

        {/* Credit Flow */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-rocket-border bg-rocket-card p-5"
        >
          <h2 className="font-display text-base font-semibold text-rocket-text mb-4">
            Credit Flow Over Time
          </h2>
          {creditFlow.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={creditFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2035" />
                <XAxis dataKey="date" stroke="#8892a4" fontSize={12} />
                <YAxis stroke="#8892a4" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a0e1a",
                    border: "1px solid #1a2035",
                    borderRadius: "8px",
                    color: "#e8eaf0",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="assigned"
                  stroke="#00c9a7"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="deducted"
                  stroke="#ff3d5a"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-12 text-rocket-muted text-sm">
              No credit activity
            </p>
          )}
        </motion.div>
      </div>

      {/* Bid Pulse Graph */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-rocket-border bg-rocket-card p-5"
      >
        <h2 className="font-display text-base font-semibold text-rocket-text mb-4">
          Bid Pulse Graph (Last 24 Hours)
        </h2>

        {hasBidPulseBids ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={bidPulseData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2035" />
              <XAxis
                dataKey="hour"
                stroke="#8892a4"
                fontSize={12}
                tickMargin={8}
                label={{
                  value: "Hour",
                  position: "insideBottom",
                  offset: -4,
                  fill: "#8892a4",
                  fontSize: 12,
                }}
              />
              <YAxis
                stroke="#8892a4"
                fontSize={12}
                allowDecimals={false}
                label={{
                  value: "Number of Bids",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#8892a4",
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0e1a",
                  border: "1px solid #1a2035",
                  borderRadius: "8px",
                  color: "#e8eaf0",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="bids"
                stroke="#f0a500"
                strokeWidth={2.5}
                dot={{ r: 2, fill: "#f0a500" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center py-12 text-rocket-muted text-sm">
            No bids yet in the last 24 hours
          </p>
        )}
      </motion.div>

      {/* Closed Auction Results */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-rocket-border overflow-hidden"
      >
        <div className="bg-rocket-card px-5 py-3 border-b border-rocket-border">
          <h2 className="font-display text-base font-semibold text-rocket-text flex items-center gap-2">
            <BarChart3 size={16} className="text-rocket-gold" />
            Closed Auction Results
          </h2>
        </div>
        {closedAuctions.length === 0 ? (
          <div className="p-12 text-center text-rocket-muted text-sm">
            No closed auctions yet
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-rocket-border bg-rocket-card/50">
                <th className="px-5 py-3 text-left text-xs font-medium text-rocket-muted uppercase">
                  Auction
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-rocket-muted uppercase">
                  Final Bid
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-rocket-muted uppercase">
                  Total Bids
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-rocket-muted uppercase">
                  Ended
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rocket-border">
              {closedAuctions.map((auction) => (
                <tr
                  key={auction.id}
                  className="bg-rocket-bg hover:bg-rocket-card/30 transition-colors"
                >
                  <td className="px-5 py-3 text-sm text-rocket-text">
                    {auction.title}
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-rocket-gold">
                    {auction.current_bid} cr
                  </td>
                  <td className="px-5 py-3 font-mono text-sm text-rocket-muted">
                    {auction.bid_count}
                  </td>
                  <td className="px-5 py-3 text-sm text-rocket-muted">
                    {formatDate(auction.end_time)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>
    </div>
  );
}
