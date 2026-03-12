import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Anti-Snipe: if bid is placed within the last 60 seconds, extend end_time by 30 seconds
const ANTI_SNIPE_WINDOW_MS = 60_000;
const ANTI_SNIPE_EXTENSION_MS = 30_000;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { auction_id, amount } = body;

  if (!auction_id || !amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid bid data" }, { status: 400 });
  }

  // Use service role client for credit operations (bypasses RLS)
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch auction
  const { data: auction, error: auctionError } = await serviceClient
    .from("auctions")
    .select("*")
    .eq("id", auction_id)
    .single();

  if (auctionError || !auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  if (auction.status !== "active") {
    return NextResponse.json(
      { error: "Auction is not active" },
      { status: 400 }
    );
  }

  const now = new Date();
  const endTime = new Date(auction.end_time);
  if (now > endTime) {
    return NextResponse.json({ error: "Auction has ended" }, { status: 400 });
  }

  const minimumBid =
    auction.current_bid > 0 ? auction.current_bid + 1 : auction.min_bid;
  if (amount < minimumBid) {
    return NextResponse.json(
      { error: `Minimum bid is ${minimumBid} credits` },
      { status: 400 }
    );
  }

  // Fetch bidder profile
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  if (!profile || profile.credits < amount) {
    return NextResponse.json(
      { error: "Insufficient credits" },
      { status: 400 }
    );
  }

  // Previous winner gets their bid refunded
  const previousWinnerId = auction.current_winner_id;
  const previousBid = auction.current_bid;

  // Deduct credits from bidder
  const { error: deductError } = await serviceClient
    .from("profiles")
    .update({ credits: profile.credits - amount })
    .eq("id", user.id);

  if (deductError) {
    return NextResponse.json(
      { error: "Failed to deduct credits" },
      { status: 500 }
    );
  }

  // Log the bid deduction
  await serviceClient.from("credit_transactions").insert({
    user_id: user.id,
    amount: -amount,
    type: "bid_deduct",
    auction_id,
    note: `Bid placed on "${auction.title}"`,
  });

  // Refund previous winner if exists and is different user
  if (previousWinnerId && previousWinnerId !== user.id && previousBid > 0) {
    const { data: prevProfile } = await serviceClient
      .from("profiles")
      .select("credits")
      .eq("id", previousWinnerId)
      .single();

    if (prevProfile) {
      await serviceClient
        .from("profiles")
        .update({ credits: prevProfile.credits + previousBid })
        .eq("id", previousWinnerId);

      await serviceClient.from("credit_transactions").insert({
        user_id: previousWinnerId,
        amount: previousBid,
        type: "bid_refund",
        auction_id,
        note: `Outbid on "${auction.title}"`,
      });
    }
  }

  // Insert the bid record
  const { error: bidError } = await serviceClient.from("bids").insert({
    auction_id,
    bidder_id: user.id,
    amount,
  });

  if (bidError) {
    return NextResponse.json(
      { error: "Failed to record bid" },
      { status: 500 }
    );
  }

  // Update auction with new current bid and winner
  const updateData: Record<string, unknown> = {
    current_bid: amount,
    current_winner_id: user.id,
  };

  // Anti-Snipe Timer: if bid in last 60s, extend by 30s
  const timeToEnd = endTime.getTime() - now.getTime();
  if (timeToEnd > 0 && timeToEnd <= ANTI_SNIPE_WINDOW_MS) {
    const newEndTime = new Date(endTime.getTime() + ANTI_SNIPE_EXTENSION_MS);
    updateData.end_time = newEndTime.toISOString();
  }

  await serviceClient
    .from("auctions")
    .update(updateData)
    .eq("id", auction_id);

  return NextResponse.json({ success: true, amount });
}
