import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const AUCTION_WIN_BONUS = 25;

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
      { error: "Storage server keys are not configured" },
      { status: 500 },
    );
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: adminProfile, error: adminProfileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (adminProfileError) {
    console.warn(
      "Unable to read profile role for winners route. Falling back to user metadata.",
      adminProfileError,
    );
  }

  const resolvedRole =
    adminProfile?.role === "admin" || adminProfile?.role === "bidder"
      ? adminProfile.role
      : user.user_metadata?.role === "admin"
        ? "admin"
        : "bidder";

  if (resolvedRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { auction_id } = body;

  if (!auction_id) {
    return NextResponse.json({ error: "auction_id required" }, { status: 400 });
  }

  // Fetch auction
  const { data: auction, error: auctionError } = await serviceClient
    .from("auctions")
    .select("*")
    .eq("id", auction_id)
    .single();

  if (auctionError || !auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  if (auction.status === "closed") {
    return NextResponse.json(
      { error: "Auction already closed" },
      { status: 400 },
    );
  }

  // Close the auction
  await serviceClient
    .from("auctions")
    .update({ status: "closed" })
    .eq("id", auction_id);

  // If there's a winner, the credits are already deducted via the bid
  // Log a winner_deduct transaction for the final winning bid
  if (auction.current_winner_id && auction.current_bid > 0) {
    const { data: winnerProfile, error: winnerProfileError } = await serviceClient
      .from("profiles")
      .select("credits")
      .eq("id", auction.current_winner_id)
      .single();

    if (winnerProfileError || !winnerProfile) {
      return NextResponse.json(
        { error: "Auction closed but failed to fetch winner profile for bonus" },
        { status: 500 },
      );
    }

    const winnerCurrentCredits = winnerProfile.credits ?? 0;
    const winnerBonusCredits = winnerCurrentCredits + AUCTION_WIN_BONUS;

    const { error: winnerBonusError } = await serviceClient
      .from("profiles")
      .update({ credits: winnerBonusCredits })
      .eq("id", auction.current_winner_id);

    if (winnerBonusError) {
      return NextResponse.json(
        { error: "Auction closed but failed to apply winner bonus" },
        { status: 500 },
      );
    }

    const { error: winnerBonusTxError } = await serviceClient
      .from("credit_transactions")
      .insert({
        user_id: auction.current_winner_id,
        amount: AUCTION_WIN_BONUS,
        type: "mining",
        auction_id,
        note: "Auction win bonus",
      });

    if (winnerBonusTxError) {
      // Best-effort rollback for consistency if tx log fails.
      await serviceClient
        .from("profiles")
        .update({ credits: winnerCurrentCredits })
        .eq("id", auction.current_winner_id);

      return NextResponse.json(
        { error: "Auction closed but failed to log winner bonus" },
        { status: 500 },
      );
    }

    await serviceClient.from("credit_transactions").insert({
      user_id: auction.current_winner_id,
      amount: 0, // Already deducted during bidding
      type: "winner_deduct",
      auction_id,
      note: `Won auction "${auction.title}" with bid of ${auction.current_bid} credits`,
    });

    return NextResponse.json({
      success: true,
      winner_id: auction.current_winner_id,
      winning_bid: auction.current_bid,
      title: auction.title,
    });
  }

  return NextResponse.json({
    success: true,
    winner_id: null,
    winning_bid: 0,
    title: auction.title,
    message: "Auction closed with no bids",
  });
}
