import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Anti-Snipe: if bid is placed within the last 60 seconds, extend end_time by 30 seconds
const ANTI_SNIPE_WINDOW_MS = 60_000;
const ANTI_SNIPE_EXTENSION_MS = 30_000;
const BID_ACTIVITY_BONUS = 2;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Service keys are not configured" },
      { status: 500 },
    );
  }

  const body = await request.json();
  const { auction_id, amount } = body;

  if (!auction_id || !amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid bid data" }, { status: 400 });
  }

  // Use service role client for credit operations (bypasses RLS)
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
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
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("credits, reserved_credits")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "Failed to fetch bidder profile" },
      { status: 500 },
    );
  }

  // Current reservation by this user on this auction (if any)
  const { data: existingReservation } = await serviceClient
    .from("credit_reservations")
    .select("amount")
    .eq("user_id", user.id)
    .eq("auction_id", auction_id)
    .maybeSingle();

  const currentlyReservedForAuction = existingReservation?.amount ?? 0;
  const reserveDelta = amount - currentlyReservedForAuction;

  if (reserveDelta > 0 && profile.credits < reserveDelta) {
    return NextResponse.json(
      { error: "Insufficient credits" },
      { status: 400 }
    );
  }

  // Previous highest bidder gets reservation released when outbid.
  const previousWinnerId = auction.current_winner_id;
  const previousBid = auction.current_bid;
  const isRebidByCurrentWinner = previousWinnerId === user.id;

  if (!isRebidByCurrentWinner && previousWinnerId && previousBid > 0) {
    const { data: previousReservation } = await serviceClient
      .from("credit_reservations")
      .select("amount")
      .eq("user_id", previousWinnerId)
      .eq("auction_id", auction_id)
      .maybeSingle();

    const releaseAmount = previousReservation?.amount ?? previousBid;

    const { data: prevProfile, error: prevProfileError } = await serviceClient
      .from("profiles")
      .select("credits, reserved_credits")
      .eq("id", previousWinnerId)
      .single();

    if (prevProfileError || !prevProfile) {
      return NextResponse.json(
        { error: "Failed to release previous reservation" },
        { status: 500 },
      );
    }

    const previousReserved = prevProfile.reserved_credits ?? 0;
    const updatedPreviousReserved = Math.max(previousReserved - releaseAmount, 0);

    const { error: releaseError } = await serviceClient
      .from("profiles")
      .update({
        credits: (prevProfile.credits ?? 0) + releaseAmount,
        reserved_credits: updatedPreviousReserved,
      })
      .eq("id", previousWinnerId);

    if (releaseError) {
      return NextResponse.json(
        { error: "Failed to release previous reservation" },
        { status: 500 },
      );
    }

    await serviceClient.from("credit_transactions").insert({
      user_id: previousWinnerId,
      amount: releaseAmount,
      type: "bid_refund",
      auction_id,
      note: `Outbid on "${auction.title}" — reservation released`,
    });

    await serviceClient
      .from("credit_reservations")
      .delete()
      .eq("user_id", previousWinnerId)
      .eq("auction_id", auction_id);
  }

  // Reserve credits for bidder (available -> reserved).
  if (reserveDelta !== 0) {
    const currentReserved = profile.reserved_credits ?? 0;
    const nextAvailable = profile.credits - reserveDelta;
    const nextReserved = currentReserved + reserveDelta;

    if (nextAvailable < 0 || nextReserved < 0) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 400 },
      );
    }

    const { error: reserveUpdateError } = await serviceClient
      .from("profiles")
      .update({
        credits: nextAvailable,
        reserved_credits: nextReserved,
      })
      .eq("id", user.id);

    if (reserveUpdateError) {
      return NextResponse.json(
        { error: "Failed to reserve credits" },
        { status: 500 },
      );
    }

    if (reserveDelta > 0) {
      await serviceClient.from("credit_transactions").insert({
        user_id: user.id,
        amount: -reserveDelta,
        type: "bid_deduct",
        auction_id,
        note: `Bid placed on "${auction.title}" — credits reserved`,
      });
    } else {
      await serviceClient.from("credit_transactions").insert({
        user_id: user.id,
        amount: Math.abs(reserveDelta),
        type: "bid_refund",
        auction_id,
        note: `Reservation adjusted on "${auction.title}"`,
      });
    }
  }

  const { error: reservationError } = await serviceClient
    .from("credit_reservations")
    .upsert(
      {
        user_id: user.id,
        auction_id,
        amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,auction_id" },
    );

  if (reservationError) {
    return NextResponse.json(
      { error: "Failed to store reservation" },
      { status: 500 }
    );
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

  // Credit Mining: +2 credits for successful bid activity
  const { data: bonusProfile, error: bonusProfileError } = await serviceClient
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  if (bonusProfileError || !bonusProfile) {
    console.error("Failed to fetch profile for bid activity bonus", bonusProfileError);
  } else {
    const currentCredits = bonusProfile.credits ?? 0;
    const bonusCredits = currentCredits + BID_ACTIVITY_BONUS;

    const { error: bonusUpdateError } = await serviceClient
      .from("profiles")
      .update({ credits: bonusCredits })
      .eq("id", user.id);

    if (bonusUpdateError) {
      console.error("Failed to apply bid activity bonus", bonusUpdateError);
    } else {
      const { error: bonusTxError } = await serviceClient
        .from("credit_transactions")
        .insert({
          user_id: user.id,
          amount: BID_ACTIVITY_BONUS,
          type: "mining",
          auction_id,
          note: "Bid activity bonus",
        });

      if (bonusTxError) {
        // Best-effort rollback for consistency if tx log fails.
        await serviceClient
          .from("profiles")
          .update({ credits: currentCredits })
          .eq("id", user.id);
        console.error("Failed to log bid activity bonus", bonusTxError);
      }
    }
  }

  return NextResponse.json({ success: true, amount });
}
